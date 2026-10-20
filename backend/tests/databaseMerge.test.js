const {buildMaps,remapRow,importOrder,orderedRows}=require('../scripts/merge-database-copy.cjs');
const pk=table=>({contype:'p',table_name:table,columns:['id']});
const fk=(table,column,target,remote='id')=>({contype:'f',table_name:table,columns:[column],referenced_table:target,referenced_columns:[remote]});
function fixture(){
 const constraints=[...['users','roles','projects','work_items','tasks'].map(pk),fk('users','role_id','roles'),fk('work_items','project_id','projects'),fk('work_items','parent_id','work_items'),fk('tasks','work_item_id','work_items')];
 const source={constraints,data:{roles:[{id:4,name:'worker'}],users:[{id:10,email:'dtc245160003@ictu.edu.vn',role_id:4,password_hash:'original-placeholder'},{id:11,email:'existing-fixture@example.test',role_id:4,password_hash:'keep-placeholder'}],projects:[{id:1}],work_items:[{id:1,project_id:1,parent_id:null},{id:2,project_id:1,parent_id:1}],tasks:[{id:1,work_item_id:2}]}};
 const base={data:{roles:[{id:8,name:'worker'}],users:[{id:2,email:'dtc245160003@ictu.edu.vn',role_id:3,system_role:'super_admin',is_active:true,password_hash:'authoritative-placeholder'}],projects:[{id:1}],work_items:[{id:1}],tasks:[{id:1}]}};
 return{source,base};
}
test('merge chooses only the explicitly approved duplicate and never mutates its authoritative profile',()=>{
 const {source,base}=fixture(),before=JSON.stringify(base),{maps,duplicates}=buildMaps(source,base);
 expect(duplicates).toEqual([{sourceId:10,targetId:2,policy:'keep_entire_sprint45_profile'}]);
 expect(maps.users.get('10')).toBe(2);expect(maps.users.get('11')).toBe(3);
 expect(maps.roles.get('4')).toBe(8);expect(JSON.stringify(base)).toBe(before);
 expect(remapRow(source,'users',source.data.users[1],maps)).toEqual({id:3,email:'existing-fixture@example.test',role_id:8,password_hash:'keep-placeholder'});
});
test('merge remaps colliding projects, parent items and task relationships consistently',()=>{
 const {source,base}=fixture(),{maps}=buildMaps(source,base);
 expect(remapRow(source,'work_items',source.data.work_items[1],maps)).toEqual({id:3,project_id:2,parent_id:2});
 expect(remapRow(source,'tasks',source.data.tasks[0],maps)).toEqual({id:2,work_item_id:3});
 expect(importOrder(source,['tasks','work_items','projects','users','roles'])).toEqual(['projects','roles','users','work_items','tasks']);
 expect(orderedRows(source,'work_items',[...source.data.work_items].reverse()).map(r=>r.id)).toEqual([1,2]);
});
test('composite foreign keys resolve their project and user coordinates through the referenced table',()=>{
 const {source,base}=fixture();source.constraints.push(fk('project_members','project_id','projects'),fk('project_members','user_id','users'),{contype:'f',table_name:'team_members',columns:['user_id','project_id'],referenced_table:'project_members',referenced_columns:['user_id','project_id']});
 const {maps}=buildMaps(source,base);
 expect(remapRow(source,'team_members',{user_id:10,project_id:1},maps)).toEqual({user_id:2,project_id:2});
});
test('merge fails closed for an unapproved email duplicate or missing referenced row',()=>{
 const {source,base}=fixture();base.data.users.push({id:7,email:'existing-fixture@example.test'});
 expect(()=>buildMaps(source,base)).toThrow('Unapproved duplicate');base.data.users.pop();
 const {maps}=buildMaps(source,base);expect(()=>remapRow(source,'tasks',{id:1,work_item_id:999},maps)).toThrow('Unmapped relationship');
});
test('merge rejects a cyclic WBS rather than breaking parent relationships',()=>{
 const {source}=fixture();expect(()=>orderedRows(source,'work_items',[{id:1,parent_id:2},{id:2,parent_id:1}])).toThrow('Cyclic');
});
