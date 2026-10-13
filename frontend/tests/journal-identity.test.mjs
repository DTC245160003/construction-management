import assert from "node:assert/strict";
import test from "node:test";
import { loadJournals } from "../src/services/journalOffline.js";

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
        async identity(uid) { writes.push(["identity",uid]); if (uid==null) data.delete("control:identity"); else data.set("control:identity",{ userId:uid,generation:"restored" }); }
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
