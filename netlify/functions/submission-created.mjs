// Runs automatically on every verified Netlify form submission.
// Adds people who asked for goal alerts to the MailerLite "Goal Alerts" group.
const API = "https://connect.mailerlite.com/api";
const GROUP_NAME = "Goal Alerts";

async function ml(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MailerLite ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function groupId() {
  const found = await ml(`/groups?filter[name]=${encodeURIComponent(GROUP_NAME)}&limit=25`);
  const hit = (found.data || []).find((g) => g.name === GROUP_NAME);
  if (hit) return hit.id;
  const made = await ml("/groups", { method: "POST", body: JSON.stringify({ name: GROUP_NAME }) });
  return made.data.id;
}

export const handler = async (event) => {
  try {
    if (!process.env.MAILERLITE_API_KEY) {
      console.log("MAILERLITE_API_KEY not set; skipping");
      return { statusCode: 200, body: "skipped" };
    }
    const { payload } = JSON.parse(event.body || "{}");
    const form = payload?.form_name;
    const d = payload?.data || {};
    const email = (d.email || "").trim();
    if (!email) return { statusCode: 200, body: "no email" };

    // Only add people who asked for alerts:
    // everyone on the goal-alerts form, and draw entrants who ticked the alerts box.
    const wants = form === "goal-alerts" || (form === "giveaway" && d.goal_alerts === "yes");
    if (!wants) return { statusCode: 200, body: "not subscribed" };

    const id = await groupId();
    const fields = {};
    if (d.name) fields.name = String(d.name).slice(0, 100);
    await ml("/subscribers", {
      method: "POST",
      body: JSON.stringify({ email, fields, groups: [id] }),
    });
    console.log(`Added ${form} subscriber to ${GROUP_NAME}`);
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error(err.message);
    return { statusCode: 200, body: "error logged" };
  }
};
