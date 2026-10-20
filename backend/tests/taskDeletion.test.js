const {createTaskService}=require('../src/services/taskService');
test('S05 delete stays inside the project transaction and passes the authenticated audit actor',async()=>{
    const removeTask=jest.fn(async()=>true),model={withProjectTransaction:jest.fn(async(id,run)=>run({removeTask}))};
    await createTaskService({model}).remove(234,87,19);
    expect(model.withProjectTransaction).toHaveBeenCalledWith(234,expect.any(Function));expect(removeTask).toHaveBeenCalledWith(234,87,19);
});
test('S05 missing or historically linked tasks cannot silently disappear',async()=>{
    const removeTask=jest.fn(async()=>false),model={withProjectTransaction:async(id,run)=>run({removeTask})};
    await expect(createTaskService({model}).remove(234,87,19)).rejects.toMatchObject({status:404});
    removeTask.mockRejectedValueOnce(Object.assign(new Error('Historical data is linked'),{status:409}));
    await expect(createTaskService({model}).remove(234,87,19)).rejects.toMatchObject({status:409});
});
