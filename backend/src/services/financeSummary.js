const v=require('./siteValidation');
const {workingDate,countWorkingDays}=require('./workingCalendar');
const cents=(quantity,price)=>(v.scaled(quantity,4)*v.scaled(price,2)+5000n)/10000n;
function contractRollup(items,contracts){
 const byId=new Map(contracts.map(c=>[c.work_item_id,c]));
 const rows=new Map();
 function visit(item,trail=new Set()){
  if(rows.has(item.id))return rows.get(item.id);
  if(trail.has(item.id))throw v.problem(422,'Cây hạng mục có vòng lặp');
  const next=new Set([...trail,item.id]);
  const children=items.filter(x=>x.parent_id===item.id).map(x=>visit(x,next));
  const c=byId.get(item.id);
  const value=children.length?children.reduce((s,x)=>s+v.scaled(x.contract_value,2),0n):c?cents(c.quantity,c.unit_price):0n;
  const accepted=children.length?children.reduce((s,x)=>s+v.scaled(x.accepted_value,2),0n):c?cents(c.approved_quantity,c.unit_price):0n;
  const percent=children.length?(value?Number(accepted)/Number(value)*100:null):c?Number(v.scaled(c.approved_quantity))/Number(v.scaled(c.quantity))*100:null;
  const result={...item,is_leaf:children.length===0,contract_value:v.formatted(value),accepted_value:v.formatted(accepted),accepted_percent:percent};
  rows.set(item.id,result);return result;
 }
 return items.map(item=>visit(item));
}
function costComparison(items,budgets,costs,contracts){
 const current=new Map();for(const budget of budgets)if(!current.has(budget.work_item_id))current.set(budget.work_item_id,budget);
 const values=new Map(contractRollup(items,contracts).map(x=>[x.id,x]));
 const cache=new Map();
 function row(item){
  if(cache.has(item.id))return cache.get(item.id);
  const children=items.filter(x=>x.parent_id===item.id).map(row);
  const budget=children.length?children.reduce((s,x)=>s+v.scaled(x.budget,2),0n):v.scaled(current.get(item.id)?.amount||'0',2);
  const actual=costs.filter(x=>x.work_item_id===item.id).reduce((s,x)=>s+v.scaled(x.amount,2),0n)+children.reduce((s,x)=>s+v.scaled(x.actual,2),0n);
  const value=values.get(item.id),c=contracts.find(x=>x.work_item_id===item.id);
  const underAccepted=children.length?(v.scaled(value.contract_value,2)>0n&&v.scaled(value.accepted_value,2)*100n<v.scaled(value.contract_value,2)*80n):c?v.scaled(c.approved_quantity)*100n<v.scaled(c.quantity)*80n:false;
  const result={...value,budget:v.formatted(budget),actual:v.formatted(actual),variance:v.formatted(budget-actual),usage_percent:budget?Number(actual)/Number(budget)*100:null,warning:budget>0n&&actual*100n>budget*80n&&underAccepted,version:current.get(item.id)?.version||0};
  cache.set(item.id,result);return result;
 }
 return items.map(row);
}
function valueProgress(items,contracts){
 const roots=contractRollup(items,contracts).filter(x=>x.parent_id==null);
 const total=roots.reduce((s,x)=>s+v.scaled(x.contract_value,2),0n),accepted=roots.reduce((s,x)=>s+v.scaled(x.accepted_value,2),0n);
 const leaves=items.filter(item=>!items.some(child=>child.parent_id===item.id));
 const configured=leaves.filter(item=>contracts.some(contract=>contract.work_item_id===item.id)).length;
 const complete=leaves.length>0&&configured===leaves.length;
 return {progress:complete&&total?Number(accepted)/Number(total)*100:null,contract_value:v.formatted(total),accepted_value:v.formatted(accepted),progress_based_on:'contract_value',contract_coverage:{configured_leaf_count:configured,total_leaf_count:leaves.length,complete}};
}
function baselineComparison(rows,context,currentFinish,calendar,holidays){
 const offset=rows.length?Math.max(...rows.map(x=>Number(x.early_finish)))-1:null;
 const baselineFinish=context&&offset!==null?workingDate(context.original_start_date,offset,context.working_days,context.holidays):null;
 let difference=null;
 if(baselineFinish&&currentFinish)difference=currentFinish>=baselineFinish?countWorkingDays(baselineFinish,currentFinish,calendar.working_days,holidays):-countWorkingDays(currentFinish,baselineFinish,calendar.working_days,holidays);
 return {baseline_finish:baselineFinish,current_finish:currentFinish,planned_finish:baselineFinish||currentFinish,forecast_finish:currentFinish,finish_variance_days:difference,baseline_context_missing:rows.length>0&&!context,finish_basis:'current_cpm_vs_original_baseline',forecast_is_projection:false};
}
module.exports={cents,contractRollup,costComparison,valueProgress,baselineComparison};
