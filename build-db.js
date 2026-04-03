require('dotenv').config();
const fs = require('fs');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
            type: SchemaType.ARRAY,
            description: "A list of exact historical figures and scenarios.",
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    id: { type: SchemaType.STRING, description: "camelCase identifier" },
                    name: { type: SchemaType.STRING, description: "Full historical name" },
                    era: { type: SchemaType.STRING, description: "Historical Era (e.g. Ancient Rome, Renaissance, 19th Century)" },
                    icon: { type: SchemaType.STRING, description: "A single unicode emoji representing them" },
                    quote: { type: SchemaType.STRING, description: "A famous or evocative quote from them" },
                    moments: {
                        type: SchemaType.ARRAY,
                        description: "3 defining timeline moments for this character",
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                year: { type: SchemaType.STRING, description: "Year of the event (e.g. 44 BCE, 1492)" },
                                title: { type: SchemaType.STRING, description: "Title of the moment" },
                                desc: { type: SchemaType.STRING, description: "Cinematic, rich description of what happens" }
                            },
                            required: ["year", "title", "desc"]
                        }
                    }
                },
                required: ["id", "name", "era", "icon", "quote", "moments"]
            }
        }
    }
});

async function run() {
    console.log("Generating 15 high-quality base figures...");
    try {
        const prompt = "Generate exactly 15 prominent historical figures from various eras (Ancient Egypt, Greece, Rome, Middle Ages, Renaissance, Edo Japan, World War 2, Sci-Rev, etc). Include the original 8: Cleopatra, Achilles, Marie Antoinette, Julius Caesar, Nikola Tesla, Leonardo da Vinci, Joan of Arc, Alexander the Great, plus 7 new distinctly compelling ones (e.g. Oda Nobunaga, Genghis Khan, Ada Lovelace, etc.). Ensure all fields are filled beautifully with cinematic tone.";
        const result = await model.generateContent(prompt);
        const data = result.response.text();
        fs.writeFileSync('./assets/figures.json', data);
        console.log("SUCCESS: 15 base figures generated and written to assets/figures.json");
    } catch(e) {
        console.error("FAILED to generate base DB:", e.message);
    }
}
run();
