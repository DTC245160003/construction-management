jest.mock("../src/config/database", () => ({
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
}));

const request = require("supertest");
const { createApp } = require("../src/app");

const mockAuthService = {
    login: jest.fn(),
    logout: jest.fn(),
    register: jest.fn(),
    getCurrentUser: jest.fn(),
};
const mockSessionStore = {
    get: jest.fn(),
    set: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn(),
};

const app = createApp({
    authService: mockAuthService,
    sessionStore: mockSessionStore,
    sessionSecret: "test-secret-that-is-at-least-32-bytes-long",
    secureCookies: false,
    trustProxy: false,
});

describe("Construction Management API", () => {
    test("GET / returns the API status as JSON", async () => {
        const response = await request(app)
            .get("/")
            .expect("Content-Type", /json/)
            .expect(200);

        expect(response.body).toEqual({
            message: "Construction Management API running"
        });
    });

    test("GET /unknown-route returns 404", async () => {
        await request(app)
            .get("/unknown-route")
            .expect(404);
    });
});
