// services/openai.js
const {OpenAI} = require("openai");

function getOpenAIClient() {
  return new OpenAI({apiKey: process.env.OPENAI_API_KEY});
}

/**
 * Запускає асистента і повертає результат
 * @param {object} messageFull
 * @returns {Promise<any>}
 */
async function runAssistant(messageFull) {
  const openai = getOpenAIClient();
  const thread = await openai.beta.threads.create();

  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: [{
      type: "text",
      text: JSON.stringify({
        ...messageFull,
        current_date: new Date().toISOString().split("T")[0],
      }),
    }],
  });

  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: process.env.OPENAI_ASSISTANT_ID,
  });

  let runStatus = "queued";
  while (runStatus !== "completed") {
    const updatedRun = await openai.beta.threads.runs.retrieve(run.id, {
      thread_id: thread.id,
    });
    runStatus = updatedRun.status;
    if (runStatus === "failed") throw new Error("Assistant run failed");
    if (runStatus !== "completed") await new Promise((r) => setTimeout(r, 1000));
  }

  const messages = await openai.beta.threads.messages.list(thread.id);
  const lastMessage = messages.data.find((m) => m.role === "assistant");
  return JSON.parse(lastMessage?.content?.[0]?.text?.value || "{}");
}

module.exports = {runAssistant};
