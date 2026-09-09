import { Client } from "@elastic/elasticsearch";

export const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
});

export const EMAIL_INDEX = "emails";

/**
 * Creates the index with explicit mappings if it doesn't exist yet. Safe to
 * call on every server boot - it just checks first.
 */
export async function ensureEmailIndex() {
  const exists = await esClient.indices.exists({ index: EMAIL_INDEX });
  if (exists) return;

  await esClient.indices.create({
    index: EMAIL_INDEX,
    mappings: {
      properties: {
        recipient: { type: "text" },
        subject: { type: "text" },
        body: { type: "text" },
        status: { type: "keyword" },
        scheduledFor: { type: "date" },
        sentAt: { type: "date" },
      },
    },
  });
  console.log(`Created Elasticsearch index "${EMAIL_INDEX}"`);
}

/**
 * Upserts a single EmailJob row into the search index. Called after every
 * create (routes/emails.ts) and every status change (worker.ts) - so the
 * index always reflects the DB's current state. We use the DB row's own id
 * as the ES document id, so re-indexing the same row twice just overwrites
 * the doc instead of creating a duplicate.
 */
export async function indexEmailJob(row: {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledFor: Date;
  sentAt: Date | null;
}) {
  try {
    await esClient.index({
      index: EMAIL_INDEX,
      id: row.id,
      document: {
        recipient: row.recipient,
        subject: row.subject,
        body: row.body,
        status: row.status,
        scheduledFor: row.scheduledFor,
        sentAt: row.sentAt,
      },
      refresh: "wait_for", // makes the doc searchable immediately - fine at this scale
    });
  } catch (err) {
    // Indexing is a "nice to have" search feature - never let an ES hiccup
    // fail the actual email scheduling/sending flow.
    console.error("Elasticsearch indexing failed for", row.id, err);
  }
}

/**
 * Full-text search across recipient/subject/body, optionally filtered by
 * status. Used by GET /api/emails/search.
 */
export async function searchEmails(query: string, status?: string) {
  const result = await esClient.search({
    index: EMAIL_INDEX,
    query: {
      bool: {
        must: query
          ? [
              {
                multi_match: {
                  query,
                  fields: ["recipient", "subject", "body"],
                },
              },
            ]
          : [{ match_all: {} }],
        filter: status ? [{ term: { status } }] : [],
      },
    },
  });

  return result.hits.hits.map((hit) => ({ id: hit._id, ...(hit._source as object) }));
}
