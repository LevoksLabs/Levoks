import { DEFAULT_BLOCK_CONFIGS, type BackendBlock, type BackendBlockType, type BlockConfig, type ServiceContainer } from "../../src/types/backend";
export function block(id: string, type: BackendBlockType, config: Partial<BlockConfig> = {}, connections: string[] = []): BackendBlock {
  return {id, type, label:id, position:{x:0,y:0}, connections, config:{...structuredClone(DEFAULT_BLOCK_CONFIGS[type]),...config} as BlockConfig};
}
export function programFixture(): ServiceContainer {
  return {id:"program_service",name:"Workflow Service",port:3001,color:"#6366f1",collapsed:false,description:"Real execution fixture",blocks:[
    block("model","db_model",{tableName:"Entry",fields:[{name:"title",type:"string",required:true,unique:true},{name:"ownerId",type:"string",required:true},{name:"tenantId",type:"string",required:true}]}),
    block("read_permission","permission",{resource:"entry",action:"read"}),
    block("user_role","role",{name:"user",permissions:["entry.read"]}),
    block("policy","access_policy",{roles:["user"],permissions:["entry.read"],ownerField:"ownerId",tenantField:"tenantId"}),
    block("list","query",{modelId:"model",operation:"find",policyId:"policy"}),
    block("create","query",{modelId:"model",operation:"create",values:{title:"$request.body.title",ownerId:"$request.body.ownerId",tenantId:"$request.body.tenantId"},policyId:"policy"}),
    block("update","query",{modelId:"model",operation:"update",filter:{_id:"$request.params.id"},values:{title:"$request.body.title",ownerId:"$request.body.ownerId",tenantId:"$request.body.tenantId"},policyId:"policy"}),
    block("list_endpoint","rest_endpoint",{route:"/entries",authRequired:true},["list"]),
    block("create_endpoint","rest_endpoint",{route:"/entries",method:"POST",authRequired:true,requestBody:[{name:"title",type:"string",required:true},{name:"ownerId",type:"string",required:false},{name:"tenantId",type:"string",required:false}]},["create"]),
    block("update_endpoint","rest_endpoint",{route:"/entries/:id",method:"PATCH",authRequired:true,requestBody:[{name:"title",type:"string",required:false},{name:"ownerId",type:"string",required:false},{name:"tenantId",type:"string",required:false}]},["update"]),
  ]};
}
