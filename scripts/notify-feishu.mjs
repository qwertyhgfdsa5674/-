const [title = "Workflow notification", text = ""] = process.argv.slice(2);
const webhookUrl = process.env.FEISHU_WEBHOOK_URL;

if (!webhookUrl) {
  console.log(
    JSON.stringify({
      event: "feishu_notification_skipped",
      reason: "missing_webhook",
      title
    })
  );
  process.exit(0);
}

const payload = {
  msg_type: "text",
  content: {
    text: [title, text].filter(Boolean).join("\n")
  }
};

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload)
});

if (!response.ok) {
  const body = await response.text().catch(() => "");
  throw new Error(`Feishu webhook failed: ${response.status} ${body}`);
}

console.log(JSON.stringify({ event: "feishu_notification_sent", title }));
