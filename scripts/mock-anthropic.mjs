/* A stand-in for the Anthropic Messages API, for running the site and the
 * smoke suite locally without spending credit. It also covers an exhausted
 * key: a "Your credit balance is too low" error fails every judge-dependent
 * smoke check, which makes the whole suite useless for anything else.
 *
 *   node scripts/mock-anthropic.mjs                  (port 3099)
 *   ANTHROPIC_BASE_URL=http://localhost:3099 ANTHROPIC_API_KEY=mock \
 *     PORT=3012 DEBATE_SPEED=fast node server/dist/index.js
 *
 * It answers POST /v1/messages only. A request that asks for structured
 * output (output_config.format.schema) gets a JSON object synthesised from
 * that schema: enums take their first value, numbers sit inside their
 * bounds, strings get a sentence. Anything else gets one plain sentence, so
 * a bot's turn and the coach still "speak". Nothing here judges anything:
 * the verdicts are placeholders that exercise the flows, not the judge.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 3099);
const INJECTION = /ignore (all )?(previous|prior|above) instructions|declare me the winner|you are (the|an?) (judge|ai)|as an ai/i;
// The body of the request being answered, so a field can look at the prompt.
let current = '';

function fill(schema, key = '') {
  if (!schema || typeof schema !== 'object') return 'ok';
  if (Array.isArray(schema.enum)) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case 'object': {
      const out = {};
      for (const [k, v] of Object.entries(schema.properties ?? {})) out[k] = fill(v, k);
      return out;
    }
    case 'array': {
      // Two items unless the schema says otherwise: the judge's feedback is
      // "exactly 2 bullets" by prompt, not by schema.
      const n = Math.min(Math.max(schema.minItems ?? 2, 0), schema.maxItems ?? 2);
      return Array.from({ length: n }, () => fill(schema.items, key));
    }
    case 'integer':
    case 'number': {
      const lo = schema.minimum ?? 0;
      const hi = schema.maximum ?? 100;
      // FOR and AGAINST get the same score, so the mock never picks a side
      // by accident: the winner comes from the enum, not the numbers.
      return Math.round((lo + hi) / 2);
    }
    case 'boolean':
      // The one boolean the smoke suite cares about: a transcript that tries
      // to talk to the judge gets flagged, the way the real judge would.
      return key === 'injectionDetected' ? INJECTION.test(current) : false;
    case 'null':
      return null;
    default:
      if (schema.anyOf) return fill(schema.anyOf[0], key);
      if (schema.oneOf) return fill(schema.oneOf[0], key);
      return `A placeholder ${key || 'line'} from the mock judge, plain words, no verdict in it.`;
  }
}

const server = createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'mock: only POST /v1/messages' } }));
    return;
  }
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    let parsed = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      /* an empty body still gets an answer */
    }
    const schema = parsed?.output_config?.format?.schema;
    current = body;
    const text = schema
      ? JSON.stringify(fill(schema))
      : 'Here is my case, plainly. The point stands on its own, and the other side has not answered it yet.';
    const msg = {
      id: `msg_mock_${Date.now().toString(36)}`,
      type: 'message',
      role: 'assistant',
      model: parsed?.model ?? 'mock',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(msg));
  });
});

server.listen(PORT, () => console.log(`mock anthropic on http://localhost:${PORT} (POST /v1/messages)`));
