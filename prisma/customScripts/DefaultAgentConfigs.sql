INSERT INTO "AIAgentConfiguration" (
  "id",
  "name",
  "providerName",
  "providerVersion",
  "instruction",
  "persona",
  "randomness",
  "version",
  "createdAt",
  "updatedAt"
)
VALUES (
  uuid_generate_v4(),
  'chatGpt',
  'OpenAI',
  'gpt-4o',
  '',
  'AI assistant for web3 operations.',
  0.5,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);