import {defineConfig} from '@playwright/test';
import process from 'node:process';
import base from './playwright.sprint45.config.js';
if(!process.env.SPRINT2_TEST_DATABASE_URL||!new URL(process.env.SPRINT2_TEST_DATABASE_URL).pathname.endsWith('_test'))throw new Error('Sprint 6-8 E2E requires a separate *_test PostgreSQL database; use backend/scripts/test-sprint68.cjs --frontend test:sprint68');
process.env.OPERATIONS_REAL_E2E='1';
export default defineConfig({...base,testMatch:'sprint68.real.spec.js',timeout:120000,outputDir:'test-results/sprint68',reporter:[['list'],['json',{outputFile:'../docs/sprint6-8/playwright-results.json'}]]});
