const express = require("express")
const dotenv = require("dotenv")
const cors = require("cors")
const fetch = require("node-fetch")
const { VertexAI } = require("@google-cloud/vertexai")
const fs = require("fs")

dotenv.config()
const app = express()
app.use(express.json())
app.use(cors())

app.use(express.static("public"))

if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    fs.writeFileSync("/tmp/key.json", process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/key.json"
}

if (!process.env.GOOGLE_CLOUD_PROJECT) {
    console.error("ERROR: GOOGLE_CLOUD_PROJECT not set")
}

const vertexAI = new VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: "us-central1"
})
const model = vertexAI.preview.getGenerativeModel({ model: "gemini-2.5-flash" })

app.post("/chat", async (req, res) => {
    try {
        const { prompt, voice_id } = req.body
        if (!prompt || !voice_id) return res.status(400).json({ error: "Missing prompt or voice_id" })

        // Vertex AI
        let generatedText = "Sorry, could not generate text."
        try {
            const vertexResponse = await model.generateContent(prompt)
            if (vertexResponse?.response?.candidates?.length > 0) {
                generatedText = vertexResponse.response.candidates[0].content.parts[0].text
            }
        } catch (err) {
            console.error("VertexAI error:", err)
        }

        // ElevenLabs
        let base64Audio = null
        try {
            const elevenResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "xi-api-key": process.env.ELEVENLABS_API_KEY
                },
                body: JSON.stringify({
                    text: generatedText,
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                })
            })
            if (elevenResponse.ok) {
                const audioBuffer = await elevenResponse.arrayBuffer()
                base64Audio = Buffer.from(audioBuffer).toString("base64")
            } else {
                console.error("ElevenLabs API error:", elevenResponse.status)
            }
        } catch (err) {
            console.error("ElevenLabs fetch error:", err)
        }

        res.json({ text: generatedText, audio: base64Audio })
    } catch (err) {
        console.error("Server error:", err)
        res.status(500).json({ error: "Internal server error" })
    }
})

app.get("/voices", async (req, res) => {
    try {
        const response = await fetch("https://api.elevenlabs.io/v1/voices", {
            headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }
        })
        const data = await response.json()
        res.json({ voices: data.voices })
    } catch (err) {
        console.error("Voices fetch error:", err)
        res.status(500).json({ error: "Could not fetch voices" })
    }
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => console.log(`Nimbus Voice backend running on ${PORT}`))
