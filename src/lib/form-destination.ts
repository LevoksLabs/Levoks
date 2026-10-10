import { v4 as uuid } from "uuid";
import type { ElementNode } from "@/types";
import type {
  BackendBlock,
  EndpointConfig,
  SchemaField,
  ValidationRule,
} from "@/types/backend";
import type { RequestMapping } from "@/lib/contracts";
import {
  endpointFields,
  fieldIdentity,
  isFormInput,
  isSubmitControl,
  compatibleFormField,
  resolveContract,
} from "@/lib/contracts";
import type { IRDiagnostic } from "@/types/ir";
import { definitionFor } from "@/lib/elements/registry";
import { selectChoices, validateSelectMetadata } from "@/lib/elements/select-options";
import { backendDefaults } from "@/lib/backend/registry";
import { defaultDatabase } from "@/lib/backend/database";
import { validationChoices } from "@/lib/backend/validation";
import { isTemporalKind, temporalConfigError } from "@/lib/backend/temporal";
import { isTextInput, textLimits, textConfigError } from "@/lib/backend/text-validation";
import { groupChoices, validateCheckboxGroup } from "@/lib/elements/choice-group-values";
import { selectionLimits } from "@/lib/elements/selection-limits";
import { fileLimits, fileConfigError } from "@/lib/backend/files";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
import { projectHistory } from "@/store/projectHistory";
import { templates } from "@/templates";
import { fieldCondition, validateFormConditions } from "@/lib/form-conditions";

/** Match native form ownership: stop at nested forms rather than collecting their controls. */
export function formControls(
  formId: string,
  elements: Record<string, ElementNode>,
  includeDisabled = false,
) {
  const controls: ElementNode[] = [],
    seen = new Set<string>();
  const pending = [...(elements[formId]?.children || [])].reverse();
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = elements[id];
    if (!node || node.type === "form") continue;
    controls.push(node);
    const children =
      !includeDisabled &&
      definitionFor(node)?.tag === "fieldset" &&
      node.props.disabled
        ? node.children
            .filter(
              (id) =>
                elements[id] && definitionFor(elements[id])?.tag === "legend",
            )
            .slice(0, 1)
        : node.children;
    pending.push(...children.toReversed());
  }
  return controls;
}

export function submissionFields(
  formId: string,
  elements: Record<string, ElementNode>,
) {
  const controls = formControls(formId, elements);
  const radioNames = new Set<string>();
  const inputs = controls
    .filter((node) => isFormInput(node, elements[node.parentId || ""]) && !node.props.disabled)
    .filter((node) => {
      const type = String(node.props.inputType || node.props.type || "");
      if (type !== "radio" || !node.props.name) return true;
      const name = String(node.props.name);
      if (radioNames.has(name)) return false;
      radioNames.add(name);
      return true;
    });
  const problems: string[] = [];
  try { validateFormConditions(elements); }
  catch (error) { problems.push((error as Error).message); }
  for (const group of controls.filter(node => node.definitionId === "radioGroup" && node.props.required && !node.props.disabled)) {
    if (!formControls(group.id, elements).some(node => isFormInput(node, elements[node.parentId || ""]) && !node.props.disabled && String(node.props.inputType || node.props.type) === "radio"))
      problems.push(`${group.props.legend || group.label || "Radio group"}: add at least one enabled radio choice for this required field.`);
  }
  if (!inputs.length)
    problems.push("Add at least one enabled input to this form.");
  if (inputs.length > 200)
    problems.push("A submission collection supports at most 200 fields.");
  if (
    !controls.some(
      (node) =>
        isSubmitControl(node) && !node.props.disabled && !node.props.loading,
    )
  )
    problems.push("Add an enabled Submit button to this form.");
  const used = new Set<string>();
  const fields = inputs.map((input, index) => {
    const inputType = input.definitionId === "checkboxGroup" ? "checkbox-group" : String(
      input.type === "input"
        ? input.props.inputType || "text"
        : input.props.type || definitionFor(input)?.tag || "text",
    );
    if (inputType === "password")
      problems.push(
        `${input.label || "Field " + (index + 1)} needs an identity workflow for passwords.`,
      );
    const file = inputType === "file" ? fileLimits(input.props) : undefined;
    if (file) {
      const error = fileConfigError(file);
      if (error) problems.push(`${input.label || "Attachment"}: ${error}`);
      if (input.props.multiple) problems.push("Submission attachments support one file per control. Turn off Multiple.");
      if (inputs.filter(node => String(node.props.inputType || node.props.type) === "file").length > 1) problems.push("Guided submissions support one attachment field per collection.");
    }
    const temporal = isTemporalKind(inputType) ? {
      min: String(input.props.min ?? ""),
      max: String(input.props.max ?? ""),
      step: String(input.props.step ?? ""),
      base: String(input.props.value ?? ""),
    } : undefined;
    const text = isTextInput(inputType) ? textLimits(input.props) : undefined;
    if (text) {
      const error = textConfigError(text);
      if (error) problems.push(`${input.label || "Field " + (index + 1)}: ${error}`);
      if (inputType === "textarea" && text.pattern) problems.push("Textarea does not support native text formats.");
    }
    if (temporal && isTemporalKind(inputType)) {
      const error = temporalConfigError(inputType, temporal);
      if (error) problems.push(`${input.label || "Field " + (index + 1)}: ${error}`);
    }
    let name = String(input.props.name || `field_${index + 1}`)
      .replace(/[^A-Za-z0-9_]/g, "_")
      .slice(0, 80);
    if (
      !/^[A-Za-z]/.test(name) ||
      [
        "constructor",
        "prototype",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ].includes(name)
    )
      name = `field_${name}`;
    if (/password|secret|token/i.test(name))
      problems.push(
        `${input.label || name} appears to collect credentials. Connect it to an identity endpoint instead of public submission storage.`,
      );
    const base = name;
    for (let suffix = 2; used.has(name); suffix++) name = `${base}_${suffix}`;
    used.add(name);
    let choices: string | undefined;
    let selections: ReturnType<typeof selectionLimits> | undefined;
    if (definitionFor(input)?.tag === "select") {
      try {
        validateSelectMetadata(input.props);
        if (input.props.multiple) {
          selections = selectionLimits(input.props);
          if (selectChoices(input.props).filter(choice => !choice.disabled && !choice.groupDisabled).length < selections.min)
            problems.push(`${input.props.label || input.label}: add enough enabled choices to meet the minimum of ${selections.min}.`);
        }
      }
      catch (error) { problems.push(`${input.label || name}: ${(error as Error).message}`); }
      choices = selectChoices(input.props).filter(choice => !choice.disabled && !choice.groupDisabled).map(choice => choice.value).join("\n");
    }
    if (inputType === "checkbox-group") {
      try {
        validateCheckboxGroup(input, elements);
        selections = selectionLimits(input.props);
        if (groupChoices(input, elements).filter(choice => !choice.props.disabled).length < selections.min)
          problems.push(`${input.props.legend || input.label}: add enough enabled choices to meet the minimum of ${selections.min}.`);
        choices = groupChoices(input, elements).filter(choice => !choice.props.disabled).map(choice => String(choice.props.value)).join("\n");
      } catch (error) { problems.push(`${input.props.legend || input.label}: ${(error as Error).message}`); }
    }
    if (inputType === "radio") {
      const members = controls.filter(
        (node) =>
          isFormInput(node) &&
          !node.props.disabled &&
          String(node.props.inputType || node.props.type) === "radio" &&
          (input.props.name
            ? node.props.name === input.props.name
            : node.id === input.id),
      );
      const values = members.map((node) => String(node.props.value ?? "on"));
      if (values.some((value) => /[\r\n]/.test(value)))
        problems.push(
          `${input.label || name}: radio values must fit on one line.`,
        );
      choices = [...new Set(values)].join("\n");
    }
    if (choices !== undefined) {
      try {
        validationChoices(choices);
      } catch (error) {
        problems.push(`${input.label || name}: ${(error as Error).message}`);
      }
    }
    return {
      input,
      choices,
      temporal,
      text,
      file,
      selections,
      condition: fieldCondition(input, elements),
      field: {
        id: input.id,
        name,
        type:
          inputType === "file" ? "object" : inputType === "checkbox-group" || definitionFor(input)?.tag === "select" && input.props.multiple
            ? "array"
            : ["number", "range"].includes(inputType)
              ? "number"
              : inputType === "checkbox"
                ? "boolean"
                : "string",
        required:
          Boolean(input.props.required) ||
          Boolean(selections?.min) ||
          (inputType === "radio" &&
            Boolean(input.props.name) &&
            controls.some(
              (node) =>
                String(node.props.inputType || node.props.type) === "radio" &&
                node.props.name === input.props.name &&
                node.props.required &&
                !node.props.disabled,
            )),
      } as SchemaField,
      inputType,
    };
  });
  return { fields, problems };
}

export function addSubmissionFormTemplate() {
  return projectHistory.run("editor", () => {
    const editor = useEditorStore.getState();
    const y = Math.max(
      40,
      ...editor.rootIds.map((id) => {
        const node = editor.elementsById[id];
        return node.layout.y + node.layout.h + 40;
      }),
    );
    const formId = editor.addElement(
      {
        ...templates.form,
        label: "Contact form",
        props: {
          ...templates.form.props,
          successMessage: "Thanks — your message has been saved.",
          resetOnSuccess: true,
        },
      },
      undefined,
      40,
      y,
    );
    createSubmissionDestination(formId, "Contact submissions");
    editor.selectElement(formId);
    return formId;
  });
}

export function suggestedFormMappings(
  formId: string,
  elements: Record<string, ElementNode>,
  config: EndpointConfig,
): RequestMapping[] {
  const inputs = formControls(formId, elements).filter(
    (node) => isFormInput(node, elements[node.parentId || ""]) && !node.props.disabled,
  );
  return endpointFields(config).flatMap((field) => {
    const input = inputs.find(
      (node) =>
        compatibleFormField(node, field) &&
        String(node.props.name || "").toLowerCase() ===
          field.name.toLowerCase(),
    );
    return input
      ? [
          {
            fieldId: fieldIdentity(field),
            location: field.location,
            source: { kind: "element" as const, elementId: input.id },
          },
        ]
      : [];
  });
}

/** Ordinary blocks/wires remain the source of truth; no hidden submission engine. */
export function connectFormDestination(
  formId: string,
  serviceId: string,
  endpointId: string,
  mappings: RequestMapping[],
) {
  const editor = useEditorStore.getState(),
    backend = useBackendStore.getState();
  const form = editor.elementsById[formId],
    service = backend.services.find((item) => item.id === serviceId);
  const endpoint = service?.blocks.find(
    (block) => block.id === endpointId && block.type === "rest_endpoint",
  );
  if (
    form?.type !== "form" ||
    !endpoint ||
    !("method" in endpoint.config) ||
    !["POST", "PUT", "PATCH"].includes(endpoint.config.method)
  )
    throw new Error("Choose an existing POST, PUT or PATCH endpoint.");
  const inputs = new Set(
    formControls(formId, editor.elementsById)
      .filter((node) => isFormInput(node, editor.elementsById[node.parentId || ""]) && !node.props.disabled)
      .map((node) => node.id),
  );
  const fields = endpointFields(endpoint.config as EndpointConfig);
  for (const field of fields)
    if (
      field.required &&
      !mappings.some(
        (mapping) =>
          mapping.location === field.location &&
          mapping.fieldId === fieldIdentity(field),
      )
    )
      throw new Error(`Choose a value for ${field.name}.`);
  if (
    mappings.some(
      (mapping) =>
        !fields.some(
          (field) =>
            field.location === mapping.location &&
            fieldIdentity(field) === mapping.fieldId,
        ) ||
        (mapping.source.kind === "element" &&
          !inputs.has(mapping.source.elementId)),
    )
  )
    throw new Error(
      "A mapped field or input is no longer available. Choose its value again.",
    );
  const diagnostics: IRDiagnostic[] = [];
  const routingState = useRoutingStore.getState();
  const existing = routingState.connections.find(
    (connection) =>
      connection.fromPortId.endsWith(`:out:${formId}`) &&
      connection.toPortId.endsWith(`:in:${endpointId}`) &&
      routingState.nodes.find((node) => node.id === connection.toNodeId)
        ?.refId === serviceId,
  );
  const preserved = existing
    ? { responseMappings: existing.responseMappings, failure: existing.failure }
    : {};
  resolveContract(
    {
      ...preserved,
      id: "form_destination",
      fromNodeId: "page",
      toNodeId: "service",
      fromPortId: `page:out:${formId}`,
      toPortId: `service:in:${endpointId}`,
      requestMappings: mappings,
    },
    endpoint.config as EndpointConfig,
    undefined,
    Object.values(editor.elementsById),
    formId,
    editor.pages,
    diagnostics,
  );
  if (diagnostics.length)
    throw new Error(diagnostics.map((item) => item.message).join(" "));
  const roots = new Set(editor.rootIds);
  let ancestor: ElementNode | undefined = form;
  const visited = new Set<string>();
  while (ancestor.parentId && !visited.has(ancestor.id)) {
    visited.add(ancestor.id);
    ancestor = editor.elementsById[ancestor.parentId];
    if (!ancestor) throw new Error("The form's page is unavailable.");
  }
  if (!roots.has(ancestor.id))
    throw new Error(
      "Select a form on the active page. Global forms require a page-specific route.",
    );
  projectHistory.run("editor", () => {
    const routing = useRoutingStore.getState();
    routing.addNode("page", editor.activePageId);
    routing.addNode("service", serviceId);
    const state = useRoutingStore.getState(),
      pageNode = state.nodes.find(
        (node) => node.type === "page" && node.refId === editor.activePageId,
      )!,
      serviceNode = state.nodes.find(
        (node) => node.type === "service" && node.refId === serviceId,
      )!;
    const fromPortId = `${pageNode.id}:out:${formId}`;
    useRoutingStore.setState({
      connections: [
        ...state.connections.filter(
          (connection) =>
            !(
              connection.fromNodeId === pageNode.id &&
              connection.fromPortId === fromPortId
            ),
        ),
        {
          ...preserved,
          id: uuid(),
          fromNodeId: pageNode.id,
          fromPortId,
          toNodeId: serviceNode.id,
          toPortId: `${serviceNode.id}:in:${endpointId}`,
          requestMappings: mappings,
        },
      ],
    });
    const events = { ...form.events };
    delete events.onSubmit;
    editor.updateElement(formId, {
      props: { requestUrl: "" },
      actions: { type: "none", target: "" },
      events,
    });
  });
}

export function createSubmissionDestination(
  formId: string,
  collectionName: string,
) {
  const editor = useEditorStore.getState(),
    analysis = submissionFields(formId, editor.elementsById);
  if (analysis.problems.length) throw new Error(analysis.problems.join(" "));
  const name = collectionName.trim();
  if (!name || name.length > 80)
    throw new Error("Choose a collection name of 1–80 characters.");
  return projectHistory.run("editor", () => {
    const backend = useBackendStore.getState();
    backend.addService(name);
    const service = useBackendStore.getState().services.at(-1)!;
    const modelId = uuid(),
      endpointId = uuid(),
      queryId = uuid(),
      transformId = uuid(),
      responseId = uuid(),
      limitId = uuid();
    const block = (
      id: string,
      type: BackendBlock["type"],
      label: string,
      config: object,
    ): BackendBlock =>
      ({
        id,
        type,
        label,
        config: { ...backendDefaults(type), ...config },
        connections: [],
        position: { x: 0, y: 0 },
      }) as BackendBlock;
    const validations = analysis.fields.flatMap(
      ({ field, input, inputType, choices, temporal, text, file, condition, selections }) => {
        const rules: ValidationRule[] = [];
        if (condition && field.required && field.type !== "array") rules.push({type: "required", message: `Complete ${field.name} when its section is shown.`});
        if (file) rules.push({type:"file",file,message:`Choose a valid ${field.name} within the allowed file size and extensions.`});
        if (temporal && isTemporalKind(inputType)) rules.push({
          type: inputType,
          temporal,
          message: `Enter a valid ${field.name} within the allowed limits.`,
        });
        if (choices !== undefined)
          rules.push({
            type: "oneOf",
            value: choices,
            message: `Choose a valid ${field.name} option.`,
          });
        if (inputType === "checkbox" && field.required)
          rules.push({
            type: "accepted",
            message: `Confirm ${field.name} before submitting.`,
          });
        if (field.type === "array" && field.required && (!selections || selections.min <= 1))
          rules.push({
            type: "required",
            message: `Choose at least one ${field.name} option.`,
          });
        if (selections) {
          if (selections.min > 1) rules.push({type: "minItems", value: selections.min, message: `Choose at least ${selections.min} ${field.name} options.`});
          if (selections.max !== undefined) rules.push({type: "maxItems", value: selections.max, message: `Choose at most ${selections.max} ${field.name} options.`});
        }
        if (text) rules.push({
          type: "text", text: {...text, maxLength: text.maxLength ?? Math.max(text.minLength ?? 0, inputType === "email" ? 320 : 2000)},
          message: `Enter ${field.name} in the allowed format and length.`,
        });
        if (field.type === "string" && !text)
          rules.push({
            type: "maxLength",
            value: String(
              Math.min(
                10000,
                Math.max(
                  1,
                  Number(input.props.maxLength) ||
                    (inputType === "email" ? 320 : 2000),
                ),
              ),
            ),
            message: `${field.name} is too long.`,
          });
        if (inputType === "email")
          rules.push({
            type: "email",
            message: "Enter a valid email address.",
          });
        if (inputType === "url") rules.push({type:"url", message:"Enter a valid absolute URL."});
        if (field.type === "number")
          for (const type of ["min", "max"] as const)
            if (
              input.props[type] !== undefined &&
              input.props[type] !== "" &&
              Number.isFinite(Number(input.props[type]))
            )
              rules.push({
                type,
                value: String(input.props[type]),
                message: `${field.name} is outside the allowed range.`,
              });
        if (condition) {
          const controller = analysis.fields.find(item => item.input.id === condition.sourceId)!;
          const active = block(uuid(), "validation", `Check ${field.name}`, {fieldName: field.name, rules});
          const inactive = block(uuid(), "validation", `Omit hidden ${field.name}`, {fieldName: field.name, rules: [{type: "absent", message: `Omit ${field.name} while its section is hidden.`}]});
          const gate = block(uuid(), "logic_if", `When ${controller.field.name} is ${condition.checked ? "checked" : "unchecked"}`, {program: {left: `$request.body.${controller.field.name}`, operator: "eq", right: condition.checked, thenSteps: [active.id], elseSteps: [inactive.id]}});
          return [gate, active, inactive];
        }
        return rules.length
          ? [
              block(uuid(), "validation", `Check ${field.name}`, {
                fieldName: field.name,
                rules,
              }),
            ]
          : [];
      },
    );
    const fields = analysis.fields.map(item => ({...item.field,
      required: item.condition ? false : item.field.required || analysis.fields.some(other => other.condition?.sourceId === item.input.id),
    }));
    const branchIds = new Set(validations.flatMap(item => "program" in item.config && item.config.program ? [...(item.config.program.thenSteps || []), ...(item.config.program.elseSteps || [])] : []));
    const blocks = [
      block(modelId, "db_model", `${name} records`, {
        tableName: "Submission",
        fields,
        timestamps: true,
        softDelete: true,
      }),
      // ponytail: per-process IP limits reset on restart; use the existing MongoDB option for shared production limits.
      block(limitId, "middleware", "Limit public submissions", {
        middlewareType: "rateLimit",
        scope: "endpoints",
        rateLimit: 20,
        rateLimitWindow: 15,
        rateLimitStore: "memory",
        rateLimitKey: "ip",
      }),
      block(endpointId, "rest_endpoint", "Receive submission", {
        route: "/api/submissions",
        method: "POST",
        modelId,
        authRequired: false,
        middlewareIds: [limitId],
        requestBody: fields,
        responseBody: [{ name: "message", type: "string", required: true }],
      }),
      ...validations,
      block(queryId, "query", "Save submission", {
        modelId,
        operation: "create",
        values: Object.fromEntries(
          analysis.fields.map(({ field }) => [
            field.name,
            `$request.body.${field.name}`,
          ]),
        ),
        output: "submission",
        policyId: "",
      }),
      block(transformId, "transform", "Confirm receipt", {
        fields: { message: "Submission received." },
        output: "receipt",
      }),
      block(responseId, "response", "Submission response", {
        status: 201,
        value: "$receipt",
      }),
      block(uuid(), "error_handler", "Submission errors", {
        fallbackMessage: "Your submission could not be saved. Please retry.",
        rules: [
          {
            kind: "validation",
            status: 400,
            message: "Check your form values and try again.",
          },
        ],
      }),
    ];
    blocks[2].connections = [
      ...validations.filter(item => !branchIds.has(item.id)).map((item) => item.id),
      queryId,
      transformId,
      responseId,
    ];
    backend.updateService(service.id, {
      database: defaultDatabase(),
      description:
        "Public write-only form submissions. No read endpoint is created. Add authenticated access policies before exposing stored records.",
      blocks: blocks.map((item, index) => ({
        ...item,
        position: { x: 0, y: index * 130 },
      })),
    });
    connectFormDestination(
      formId,
      service.id,
      endpointId,
      analysis.fields.map(({ input, field }) => ({
        fieldId: fieldIdentity(field),
        location: "body",
        source: { kind: "element", elementId: input.id },
      })),
    );
    return { serviceId: service.id, endpointId };
  });
}
