jest.mock('express-session',()=>jest.fn(()=>jest.fn()));
const session=require('express-session');
const {createSession}=require('../src/config/session');
test('S02 session expires after twelve idle hours and renews on authenticated activity',()=>{
    createSession({store:{},secret:'a'.repeat(32),secureCookies:true});
    const config=session.mock.calls.at(-1)[0];
    expect(config.cookie).toMatchObject({maxAge:12*60*60*1000,httpOnly:true,secure:true,sameSite:'lax'});
    expect(config.rolling).toBe(true);expect(config.saveUninitialized).toBe(false);
});
