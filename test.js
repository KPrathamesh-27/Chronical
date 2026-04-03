const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testModel(name) {
    try {
        const model = genAI.getGenerativeModel({ model: name });
        await model.generateContent("hello");
        console.log(`SUCCESS: ${name}`);
    } catch(e) {
        console.log(`FAILED: ${name} -> ${e.message}`);
    }
}
async function run() {
    await testModel("gemini-1.5-flash");
    await testModel("gemini-1.5-flash-latest");
    await testModel("gemini-1.5-pro");
    await testModel("gemini-1.0-pro");
}
run();
