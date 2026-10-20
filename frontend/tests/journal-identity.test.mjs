import assert from "node:assert/strict";
import test from "node:test";
import { clearOfflineIdentity,loadJournals } from "../src/services/journalOffline.js";

function pendingFetches() {
    const requests=[];
    let notify;
    const started=new Promise((resolve) => { notify=resolve; });
    return {
        requests,started,
        fetch(path) { return new Promise((resolve) => { requests.push({ path,resolve }); if (requests.length===2) notify(); }); },
        finish(status=200) { for (const request of requests) request.resolve(Response.json(request.path==="/auth/me" ? { user:{ id:1 } } : { journals:[],catalog:[] },{ status })); }
    };
}
function queueStore(identity) {
    const data=new Map([["control:identity",identity]]),writes=[];
    return {
        data,writes,
        async get(store,key) { return data.get(`${store}:${key}`); },
        async put(store,value) { writes.push([store,value]); data.set(`${store}:${value.key}`,value); },
        async identity(uid,options={}) {
            if (("expectedGeneration" in options) && (data.has("control:logout") || data.get("control:identity")?.generation!==options.expectedGeneration)) return false;
            writes.push(["identity",uid]);
            if (uid==null) {
                data.delete("control:identity"); data.delete("cache:last-user");
                if (options.logout!==false) data.set("control:logout",{ completed:true });
                return true;
            }
            const next={ userId:uid,generation:"restored" }; data.set("control:identity",next); data.delete("control:logout"); return next;
        }
    };
}

test("a successful in-flight journal load cannot restore a logged-out identity or cache its stale result",async () => {
    const originalFetch=globalThis.fetch,originalQueue=globalThis.XdsJournalQueue;
    const queue=queueStore({ userId:1,generation:"engineer-session" }),network=pendingFetches();
    globalThis.fetch=network.fetch; globalThis.XdsJournalQueue=queue;
    try {
        const loaded=loadJournals(7); await network.started;
        queue.data.delete("control:identity");
        network.finish();
        await assert.rejects(loaded,{ name:"AbortError" });
        assert.equal(queue.data.get("control:identity"),undefined);
        assert.deepEqual(queue.writes,[]);
    } finally { globalThis.fetch=originalFetch; globalThis.XdsJournalQueue=originalQueue; }
});

test("a stale authentication failure cannot clear a newer account's offline identity",async () => {
    const originalFetch=globalThis.fetch,originalQueue=globalThis.XdsJournalQueue;
    const queue=queueStore({ userId:1,generation:"engineer-session" }),network=pendingFetches();
    globalThis.fetch=network.fetch; globalThis.XdsJournalQueue=queue;
    try {
        const loaded=loadJournals(7); await network.started;
        const next={ userId:2,generation:"worker-session" }; queue.data.set("control:identity",next);
        network.finish(401);
        await assert.rejects(loaded,{ name:"AbortError" });
        assert.deepEqual(queue.data.get("control:identity"),next);
        assert.deepEqual(queue.writes,[]);
    } finally { globalThis.fetch=originalFetch; globalThis.XdsJournalQueue=originalQueue; }
});

test("logout during a load with no initial identity cannot restore stale authentication",async () => {
    const originalFetch=globalThis.fetch,originalQueue=globalThis.XdsJournalQueue;
    const queue=queueStore(undefined),network=pendingFetches();
    globalThis.fetch=network.fetch; globalThis.XdsJournalQueue=queue;
    try {
        const loaded=loadJournals(7); await network.started;
        await clearOfflineIdentity(); const writes=[...queue.writes]; network.finish();
        await assert.rejects(loaded,{ name:"AbortError" });
        assert.equal(queue.data.get("control:identity"),undefined);
        assert.deepEqual(queue.writes,writes);
    } finally { globalThis.fetch=originalFetch; globalThis.XdsJournalQueue=originalQueue; }
});

test("a durable logout guard rejects cached journals despite stale identity and remembered user",async () => {
    const originalFetch=globalThis.fetch,originalQueue=globalThis.XdsJournalQueue;
    const queue=queueStore({ userId:1,generation:"old-session" });
    queue.data.set("control:logout",{ tokens:["logout-before-cleanup-failed"] });
    queue.data.set("cache:last-user",{ value:1 });
    queue.data.set("cache:project:7:user:1",{ value:{ user:{ id:1 },data:{ journals:[{ content:"private cached journal" }] } } });
    globalThis.fetch=() => { throw new Error("guarded loads must not request authentication or journals"); }; globalThis.XdsJournalQueue=queue;
    try {
        await assert.rejects(loadJournals(7),{ status:401 }); assert.deepEqual(queue.writes,[]);
    } finally { globalThis.fetch=originalFetch; globalThis.XdsJournalQueue=originalQueue; }
});

test("a fresh authenticated journal load can establish identity and retain its cache",async () => {
    const originalFetch=globalThis.fetch,originalQueue=globalThis.XdsJournalQueue;
    const queue=queueStore(undefined),network=pendingFetches();
    globalThis.fetch=network.fetch; globalThis.XdsJournalQueue=queue;
    try {
        const loaded=loadJournals(7); await network.started; network.finish();
        assert.equal((await loaded).user.id,1);
        assert.equal(queue.data.get("control:identity").userId,1);
        assert.equal(queue.data.get("cache:project:7:user:1").value.user.id,1);
    } finally { globalThis.fetch=originalFetch; globalThis.XdsJournalQueue=originalQueue; }
});

test("a forbidden project invalidates remembered identity without blocking a later authorized project",async () => {
    const originalFetch=globalThis.fetch,originalQueue=globalThis.XdsJournalQueue;
    const queue=queueStore({ userId:1,generation:"engineer-session" });
    const retained={ value:{ user:{ id:1 },data:{ journals:[{ content:"retained private journal" }] } } };
    queue.data.set("cache:last-user",{ value:1 }); queue.data.set("cache:project:7:user:1",retained);
    globalThis.XdsJournalQueue=queue;
    globalThis.fetch=async (path) => Response.json(path==="/auth/me" ? { user:{ id:1 } } : { journals:[],catalog:[] },{ status:path==="/projects/7/journals" ? 403 : 200 });
    try {
        await assert.rejects(loadJournals(7),{ status:403 });
        assert.equal(queue.data.get("control:identity"),undefined);
        assert.equal(queue.data.get("cache:last-user"),undefined);
        assert.equal(queue.data.get("control:logout"),undefined);
        assert.deepEqual(queue.data.get("cache:project:7:user:1"),retained);
        assert.equal((await loadJournals(8)).user.id,1);
        assert.equal(queue.data.get("control:identity").userId,1);
        assert.equal(queue.data.get("cache:project:8:user:1").value.user.id,1);
        assert.equal(queue.data.get("control:logout"),undefined);
    } finally { globalThis.fetch=originalFetch; globalThis.XdsJournalQueue=originalQueue; }
});
