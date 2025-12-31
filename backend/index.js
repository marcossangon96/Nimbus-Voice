import express from "express"
import cors from "cors"
import fetch from "node-fetch"
import { VertexAI } from "@google-cloud/vertexai"
import { getVercelOidcToken } from "@vercel/oidc"
import { ExternalAccountClient } from "google-auth-library"

const app = express()
app.use(express.json())
app.use(cors())

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID
const GCP_PROJECT_NUMBER = process.env.GCP_PROJECT_NUMBER
const GCP_SERVICE_ACCOUNT_EMAIL = process.env.GCP_SERVICE_ACCOUNT_EMAIL
const GCP_WORKLOAD_IDENTITY_POOL_ID = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID
const GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID

const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    subject_token_supplier: {
        getSubjectToken: getVercelOidcToken,
    },
})

async function createVertexModel() {
    const tokenResponse = await authClient.getAccessToken()
    const accessToken = tokenResponse.token

    const vertexAI = new VertexAI({
        auth: {
            getRequestHeaders: async () => ({ Authorization: `Bearer ${accessToken}` }),
        },
        project: GCP_PROJECT_ID,
        location: "us-central1",
    })

    return vertexAI.preview.getGenerativeModel({ model: "gemini-2.5-flash" })
}

let modelPromise = createVertexModel()

app.post("/chat", async (req, res) => {
    try {
        const { prompt, voice_id } = req.body
        if (!prompt || !voice_id) return res.status(400).json({ error: "Missing prompt or voice_id" })

        const model = await modelPromise
        const vertexResponse = await model.generateContent(prompt)
        const generatedText = vertexResponse.response.candidates[0].content.parts[0].text

        const elevenResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": process.env.ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
                text: generatedText,
                voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
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
            headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
        })
        const data = await response.json()
        res.json({ voices: data.voices })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: err.message })
    }
})

app.get("/", (req, res) => res.redirect("/index.html"))

const PORT = process.env.PORT || 8080
app.listen(PORT, () => console.log(`Nimbus Voice backend running on ${PORT}`))
