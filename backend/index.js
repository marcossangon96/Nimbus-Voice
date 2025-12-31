const express = require("express")
const dotenv = require("dotenv")
const cors = require("cors")
const fetch = require("node-fetch") // node-fetch v2
const { VertexAI } = require("@google-cloud/vertexai")
const path = require("path")

dotenv.config()
const app = express()
app.use(express.json())
app.use(cors())

const __dirnameStatic = path.resolve()
app.use(express.static(path.join(__dirnameStatic, "public")))

const vertexAI = new VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: "us-central1"
})
const model = vertexAI.preview.getGenerativeModel({ model: "gemini-2.5-flash" })

app.post("/chat", async (req, res) => {
    try {
        const { prompt, voice_id } = req.body
        if (!prompt || !voice_id) return res.status(400).json({ error: "Missing prompt or voice_id" })

        const vertexResponse = await model.generateContent(prompt)
        const generatedText = vertexResponse.response.candidates[0].content.parts[0].text

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

        const audioBuffer = await elevenResponse.arrayBuffer()
        const base64Audio = Buffer.from(audioBuffer).toString("base64")

        res.json({ text: generatedText, audio: base64Audio })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: err.message })
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
        console.error(err)
        res.status(500).json({ error: err.message })
    }
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => console.log(`Nimbus Voice backend running on ${PORT}`))
