const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8788);
const ROOT = __dirname;
const XAI_BASE_URL = 'https://api.x.ai/v1';
const DATA_ROOT = process.env.FIRSTVID_DATA_DIR || ROOT;
const ENV_FILE = process.env.FIRSTVID_ENV_FILE || path.join(ROOT, '.env');
const CACHE_ROOT = path.join(DATA_ROOT, '.firstvid-cache');
const GENERATED_ROOT = path.join(DATA_ROOT, 'generated');
const LESSON_CACHE_VERSION = 'lesson-v2';
const VIDEO_CACHE_VERSION = 'video-v1';

loadEnv(ENV_FILE);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.md': 'text/markdown; charset=utf-8'
};

const homeworkSchema = {
  name: 'firstvid_homework_analysis',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'subject',
      'problem',
      'detected',
      'blocks',
      'analogy',
      'questions',
      'tryIt',
      'script',
      'storyboardCaptions',
      'videoPrompt',
      'parentNote',
      'confidence',
      'safetyNote'
    ],
    properties: {
      subject: { type: 'string' },
      problem: { type: 'string' },
      detected: { type: 'string' },
      blocks: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'icon', 'body'],
          properties: {
            title: { type: 'string' },
            icon: {
              type: 'string',
              enum: [
                'fa-book-open-reader',
                'fa-cubes',
                'fa-lightbulb',
                'fa-magnifying-glass',
                'fa-people-group',
                'fa-plus',
                'fa-scale-balanced',
                'fa-shoe-prints',
                'fa-sun',
                'fa-leaf',
                'fa-layer-group',
                'fa-table-columns',
                'fa-hashtag'
              ]
            },
            body: { type: 'string' }
          }
        }
      },
      analogy: { type: 'string' },
      questions: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: { type: 'string' }
      },
      tryIt: { type: 'string' },
      script: { type: 'string' },
      storyboardCaptions: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: { type: 'string' }
      },
      videoPrompt: { type: 'string' },
      parentNote: { type: 'string' },
      confidence: { type: 'number' },
      safetyNote: { type: 'string' }
    }
  },
  strict: true
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        xaiConfigured: Boolean(process.env.XAI_API_KEY)
      });
    }

    if (req.method === 'GET' && req.url === '/api/config') {
      return sendJson(res, 200, {
        ok: true,
        xaiConfigured: Boolean(process.env.XAI_API_KEY),
        envFile: ENV_FILE,
        dataDir: DATA_ROOT
      });
    }

    if (req.method === 'POST' && req.url === '/api/config') {
      return await handleSaveConfig(req, res);
    }

    if (req.method === 'POST' && req.url === '/api/analyze-homework') {
      return await handleAnalyze(req, res);
    }

    if (req.method === 'POST' && req.url === '/api/generate-video') {
      return await handleGenerateVideo(req, res);
    }

    if (req.method === 'POST' && req.url === '/api/chat-subject') {
      return await handleChatSubject(req, res);
    }

    if (req.method === 'GET') {
      return serveStatic(req, res);
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Unexpected server error' });
  }
});

function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const url = `http://localhost:${actualPort}`;
      console.log(`FirstVid local AI server running at ${url}`);
      console.log(process.env.XAI_API_KEY ? 'xAI key loaded from environment.' : `No XAI_API_KEY found. Add one to ${ENV_FILE} for real AI.`);
      resolve({ server, port: actualPort, url });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function handleAnalyze(req, res) {
  const body = await readJsonBody(req);
  const imageDataUrl = body.imageDataUrl;
  const textInput = typeof body.textInput === 'string' ? body.textInput.trim() : '';
  const shouldUseWebSearch = /(https?:\/\/|www\.|latest|current|online|web source|background online)/i.test(textInput);

  if ((!imageDataUrl || !imageDataUrl.startsWith('data:image/')) && !textInput) {
    return sendJson(res, 400, { error: 'Please send a homework image, written task, or URL.' });
  }

  const cacheKey = buildLessonCacheKey(imageDataUrl, textInput);
  const cached = readCacheEntry('lessons', cacheKey);
  if (cached && cached.source === 'ai' && cached.analysis) {
    return sendJson(res, 200, {
      mode: 'cache',
      cached: true,
      analysis: cached.analysis,
      message: 'Loaded a saved Grok analysis from local cache. No new credits used.'
    });
  }

  if (!process.env.XAI_API_KEY) {
    return sendJson(res, 401, {
      code: 'XAI_KEY_MISSING',
      error: 'Grok analysis is required for Step 2. Add XAI_API_KEY to .env, then restart FirstVid.'
    });
  }

  const prompt = [
    'You are FirstVid, a first-principles homework coach for kids ages 3-18.',
    'Analyze the homework input. It may be an image, typed text, a copied assignment, a screenshot, or a URL.',
    'Extract the actual task, subject, and likely student level.',
    shouldUseWebSearch
      ? 'Use web_search to understand the URL/current background before explaining.'
      : 'Do not browse unless the input specifically needs current web context.',
    'Explain from first principles: smallest concepts first, then connect them.',
    'Never simply give away a final numerical answer. Leave the last arithmetic/checking move for the learner.',
    'Respond in the same language as the user/homework input when it is clear.',
    'Keep the explanation light, bouncy, and concise. Prefer short sentences.',
    'For blocks, use playful titles and body text under 35 words each.',
    'Keep analogy, questions, and try-it-yourself short and punchy.',
    'Keep the video script fun, structured, and complete in the shortest practical time.',
    'Return only structured JSON matching the schema.'
  ].join('\n');

  const content = [];
  if (imageDataUrl && imageDataUrl.startsWith('data:image/')) {
    content.push({
      type: 'input_image',
      image_url: imageDataUrl,
      detail: 'high'
    });
  }
  if (textInput) {
    content.push({
      type: 'input_text',
      text: `Written homework / URL input:\n${textInput}`
    });
  }
  content.push({
    type: 'input_text',
    text: prompt
  });

  const payload = {
    model: process.env.XAI_ANALYSIS_MODEL || 'grok-4.5',
    store: false,
    input: [
      {
        role: 'user',
        content
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: homeworkSchema.name,
        schema: homeworkSchema.schema,
        strict: homeworkSchema.strict
      }
    }
  };
  if (shouldUseWebSearch) {
    payload.tools = [{ type: 'web_search' }];
  }

  let response;
  try {
    response = await xaiFetch('/responses', payload);
  } catch (error) {
    const canRetryWithoutSearch = /tool|web_search|search/i.test(error.message);
    if (!canRetryWithoutSearch) {
      const apiStatus = publicApiError(error);
      return sendGrokUnavailable(res, apiStatus, 'analysis');
    }
    try {
      const retryPayload = { ...payload };
      delete retryPayload.tools;
      response = await xaiFetch('/responses', retryPayload);
    } catch (retryError) {
      const apiStatus = publicApiError(retryError);
      return sendGrokUnavailable(res, apiStatus, 'analysis');
    }
  }

  const analysis = normalizeAnalysis(parseStructuredResponse(response));
  writeCacheEntry('lessons', cacheKey, { source: 'ai', analysis, citations: response.citations || [] });
  sendJson(res, 200, {
    mode: 'ai',
    analysis,
    citations: response.citations || []
  });
}

async function handleGenerateVideo(req, res) {
  const body = await readJsonBody(req);
  const analysis = body.analysis && typeof body.analysis === 'object' ? body.analysis : null;
  const prompt = buildGroundedVideoPrompt(analysis, String(body.videoPrompt || body.script || '').trim());
  const duration = chooseVideoDuration(analysis, prompt);
  const resolution = process.env.FIRSTVID_VIDEO_RESOLUTION || '480p';
  const videoCacheKey = buildVideoCacheKey(prompt, duration, resolution);

  if (!process.env.XAI_API_KEY) {
    return sendJson(res, 200, {
      mode: 'setup-needed',
      videoUrl: './firstvid_demo.mp4',
      message: 'Add XAI_API_KEY to .env, then restart the server to generate a new Grok video.'
    });
  }

  if (!prompt) {
    return sendJson(res, 400, { error: 'Missing video prompt.' });
  }

  const cachedVideo = readVideoCache(videoCacheKey);
  if (cachedVideo) {
    return sendJson(res, 200, {
      mode: 'cache',
      cached: true,
      videoUrl: cachedVideo.videoUrl,
      duration: cachedVideo.duration,
      message: 'Loaded saved cinematic clip. No credits used.'
    });
  }

  try {
    const start = await xaiFetch('/videos/generations', {
      model: process.env.XAI_VIDEO_MODEL || 'grok-imagine-video',
      prompt: constrainVideoPrompt(prompt),
      duration,
      aspect_ratio: '16:9',
      resolution
    });

    const requestId = start.request_id;
    if (!requestId) {
      throw new Error('xAI video generation did not return a request_id.');
    }

    const deadline = Date.now() + Number(process.env.FIRSTVID_VIDEO_TIMEOUT_MS || 180000);
    while (Date.now() < deadline) {
      await sleep(5000);
      const status = await xaiFetch(`/videos/${encodeURIComponent(requestId)}`, null, 'GET');
      if (status.status === 'done' && status.video && status.video.url) {
        const localVideoUrl = await saveRemoteVideo(status.video.url).catch((error) => {
          console.warn(`Could not save generated video locally: ${error.message}`);
          return status.video.url;
        });
        writeCacheEntry('videos', videoCacheKey, {
          source: 'ai',
          videoUrl: localVideoUrl,
          duration: status.video.duration || duration,
          promptHash: videoCacheKey
        });
        return sendJson(res, 200, {
          mode: 'ai',
          videoUrl: localVideoUrl,
          duration: status.video.duration,
          message: 'Grok video generated.'
        });
      }
      if (status.status === 'failed' || status.status === 'expired') {
        return sendJson(res, 200, {
          mode: 'local-video-fallback',
          videoUrl: './firstvid_demo.mp4',
          duration: 0,
          message: 'Cinematic AI video did not finish, so the local explainer stays in charge.'
        });
      }
    }

    sendJson(res, 200, {
      mode: 'local-video-fallback',
      videoUrl: './firstvid_demo.mp4',
      duration: 0,
      message: 'Cinematic AI video is still running. Keep using the local explainer for now.'
    });
  } catch (error) {
    const apiStatus = publicApiError(error);
    sendJson(res, 200, {
      mode: 'local-video-fallback',
      code: apiStatus === 'credits-or-permission' ? 'OUT_OF_CREDITS' : 'GROK_VIDEO_UNAVAILABLE',
      videoUrl: './firstvid_demo.mp4',
      duration: 0,
      message: apiStatus === 'credits-or-permission'
        ? 'Out of Grok video credits or spending limit reached. The local funny explainer stays available.'
        : 'Cinematic AI video is unavailable right now. The local funny explainer stays available.'
    });
  }
}

async function handleChatSubject(req, res) {
  const body = await readJsonBody(req);
  const analysis = body.analysis && typeof body.analysis === 'object' ? body.analysis : {};
  const message = String(body.message || '').trim();
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

  if (!process.env.XAI_API_KEY) {
    return sendJson(res, 401, {
      code: 'XAI_KEY_MISSING',
      error: 'Grok chat needs XAI_API_KEY in .env.'
    });
  }

  if (!message) {
    return sendJson(res, 400, { error: 'Missing chat message.' });
  }

  const context = [
    `Subject: ${safeText(analysis.subject)}`,
    `Problem: ${safeText(analysis.problem)}`,
    `Analogy: ${safeText(analysis.analogy)}`,
    `Try it: ${safeText(analysis.tryIt)}`,
    'Blocks:',
    Array.isArray(analysis.blocks)
      ? analysis.blocks.map((block) => `- ${safeText(block.title)}: ${safeText(block.body)}`).join('\n')
      : ''
  ].join('\n');

  try {
    const response = await xaiFetch('/responses', {
      model: process.env.XAI_CHAT_MODEL || process.env.XAI_ANALYSIS_MODEL || 'grok-4.5',
      store: false,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'You are FirstVid chat coach.',
                'Respond in the same language as the learner.',
                'Be concise, sharp, and useful.',
                'Use plain text, no Markdown formatting.',
                'Do not repeat the previous building blocks or video script verbatim.',
                'If the learner message is short or fragmentary, infer what it refers to from the chat history and lesson context.',
                'If the learner asks a yes/no or follow-up fragment, answer that directly first.',
                'First say exactly what point they are asking about in one short sentence.',
                'Then explain the core mechanism in 2 to 4 tight steps.',
                'Use the actual subject terms from the lesson. Avoid random analogies unless they directly clarify the mechanism.',
                'Be lightly funny in a quick improv-teacher style, but never ramble.',
                'End with one precise check question or one next micro-step, not a broad next topic.',
                'Do not give away final numerical answers unless the learner asks for checking after showing their own work.'
              ].join('\n')
            }
          ]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: `Current lesson context:\n${context}` }]
        },
        ...history.map((item) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: [{ type: 'input_text', text: safeText(item.content) }]
        })),
        {
          role: 'user',
          content: [{ type: 'input_text', text: message }]
        }
      ]
    });

    sendJson(res, 200, { answer: extractTextResponse(response) });
  } catch (error) {
    const apiStatus = publicApiError(error);
    sendGrokUnavailable(res, apiStatus, 'chat');
  }
}

async function handleSaveConfig(req, res) {
  const body = await readJsonBody(req);
  const key = normalizeXaiApiKey(body.xaiApiKey);

  if (!/^xai-[^\s"'`]{8,}$/i.test(key)) {
    return sendJson(res, 400, {
      code: 'INVALID_XAI_KEY',
      error: 'Please enter an xAI API key that starts with xai-. Do not include screenshots or extra text.'
    });
  }

  try {
    fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });
    upsertEnvValue(ENV_FILE, 'XAI_API_KEY', key);
    process.env.XAI_API_KEY = key;
    sendJson(res, 200, {
      ok: true,
      xaiConfigured: true,
      message: 'xAI key saved locally for this computer.'
    });
  } catch (error) {
    sendJson(res, 500, {
      code: 'CONFIG_SAVE_FAILED',
      error: `Could not save local key: ${error.message}`
    });
  }
}

function sendGrokUnavailable(res, apiStatus, area) {
  if (apiStatus === 'invalid-key') {
    return sendJson(res, 401, {
      code: 'XAI_KEY_INVALID',
      error: 'The saved xAI key was rejected. Paste the full key that starts with xai-, then try again.'
    });
  }

  if (apiStatus === 'credits-or-permission') {
    return sendJson(res, 402, {
      code: 'OUT_OF_CREDITS',
      error: area === 'chat'
        ? 'Out of Grok credits or spending limit reached. Chat needs Grok, so it is paused for now.'
        : 'Out of Grok credits or spending limit reached. Step 2 requires Grok analysis, so FirstVid cannot analyze new homework right now.'
    });
  }

  return sendJson(res, 502, {
    code: area === 'chat' ? 'GROK_CHAT_UNAVAILABLE' : 'GROK_ANALYSIS_UNAVAILABLE',
    error: area === 'chat'
      ? 'Grok chat is unavailable right now. Please try again later.'
      : 'Grok analysis is unavailable right now. Step 2 requires Grok, so please try again later.'
  });
}

async function xaiFetch(endpoint, payload, method = 'POST') {
  const response = await fetch(`${XAI_BASE_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      ...(payload ? { 'Content-Type': 'application/json' } : {})
    },
    body: payload ? JSON.stringify(payload) : undefined
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const detail = data.error && data.error.message ? data.error.message : JSON.stringify(data).slice(0, 900);
    const message = detail || response.statusText;
    throw new Error(`xAI API error ${response.status}: ${message}`);
  }

  return data;
}

async function saveRemoteVideo(remoteUrl) {
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Video download failed: ${response.statusText}`);
  }

  const generatedDir = GENERATED_ROOT;
  fs.mkdirSync(generatedDir, { recursive: true });
  const fileName = `firstvid_ai_${Date.now()}.mp4`;
  const filePath = path.join(generatedDir, fileName);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
  return `/generated/${fileName}`;
}

function parseStructuredResponse(response) {
  if (response.output_text) {
    return JSON.parse(response.output_text);
  }

  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      const text = part.text || part.output_text;
      if (typeof text === 'string' && text.trim().startsWith('{')) {
        return JSON.parse(text);
      }
    }
  }

  if (typeof response.content === 'string' && response.content.trim().startsWith('{')) {
    return JSON.parse(response.content);
  }

  throw new Error('Could not parse structured analysis from xAI response.');
}

function extractTextResponse(response) {
  if (response.output_text) return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  const parts = [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (typeof part.text === 'string') parts.push(part.text);
      if (typeof part.output_text === 'string') parts.push(part.output_text);
    }
  }
  return parts.join('\n').trim() || 'I need one more clue. What part feels fuzzy?';
}

function localAnalysisFromInput(textInput, imageDataUrl, note = '') {
  const raw = safeText(textInput);
  const hasImage = Boolean(imageDataUrl && imageDataUrl.startsWith('data:image/'));
  const isGerman = /\b(und|oder|was|wie|warum|bitte|erkl[aä]r|aufgabe|mathe|pflanze|zelle)\b/i.test(raw);
  const topic = inferTopic(raw, hasImage, isGerman);
  const labels = isGerman
    ? {
        detected: `Lokal erkannt: ${topic.subject}.`,
        first: 'Der kleine Start',
        second: 'Die Regel im Hintergrund',
        third: 'Ein mutiger Mini-Schritt',
        analogy: 'Stell es dir wie eine kleine Theaterbuehne vor: Jede Idee hat nur eine Aufgabe, dann kommt die naechste dran.',
        questions: ['Was ist die eigentliche Frage?', 'Welche Mini-Idee muss zuerst stimmen?', 'Wo siehst du das im echten Leben?'],
        tryIt: 'Erklaere die erste Mini-Idee laut in einem Satz. Danach machst du nur den naechsten Schritt.',
        safety: 'Lokale Offline-Erklaerung. Kein API-Credit benutzt.'
      }
    : {
        detected: `Local read: ${topic.subject}.`,
        first: 'The tiny start',
        second: 'The rule underneath',
        third: 'One brave mini-move',
        analogy: 'Picture it as a little stage play: each idea gets one simple job, then the next idea walks on.',
        questions: ['What is the real question?', 'Which tiny idea must be true first?', 'Where does this show up in real life?'],
        tryIt: 'Say the first tiny idea out loud in one sentence. Then make only the next move.',
        safety: 'Local offline explanation. No API credits used.'
      };

  return normalizeAnalysis({
    subject: topic.subject,
    problem: topic.problem,
    detected: labels.detected,
    blocks: [
      {
        title: labels.first,
        icon: topic.icon,
        body: topic.block1
      },
      {
        title: labels.second,
        icon: 'fa-cubes',
        body: topic.block2
      },
      {
        title: labels.third,
        icon: 'fa-shoe-prints',
        body: topic.block3
      }
    ],
    analogy: topic.analogy || labels.analogy,
    questions: topic.questions || labels.questions,
    tryIt: topic.tryIt || labels.tryIt,
    script: topic.script,
    storyboardCaptions: topic.storyboardCaptions,
    videoPrompt: topic.videoPrompt,
    parentNote: note,
    confidence: raw ? 0.58 : 0.28,
    safetyNote: labels.safety
  });
}

function inferTopic(raw, hasImage, isGerman) {
  const text = raw.toLowerCase();
  const problem = raw
    ? shortenServer(raw.replace(/^https?:\/\/\S+/i, isGerman ? 'das verlinkte Thema' : 'the linked topic'), 180)
    : hasImage
      ? (isGerman ? 'Das Foto wurde geladen. Lies zuerst die sichtbare Frage.' : 'The photo is loaded. Start by reading the visible question.')
      : (isGerman ? 'Eine Aufgabe soll in kleine Ideen zerlegt werden.' : 'A homework task needs to be broken into tiny ideas.');

  if (/(cookie|friend|multiply|multiplication|times|each|\d+\s*[x×*]\s*\d+|gruppe|mal|jeweils|keks)/i.test(raw)) {
    return {
      subject: isGerman ? 'Mathe: Gleiche Gruppen' : 'Math: Equal Groups',
      problem,
      icon: 'fa-people-group',
      block1: isGerman ? 'Multiplikation startet als gleiche Gruppen: erst Gruppen zaehlen, dann schauen, was in jeder Gruppe steckt.' : 'Multiplication starts as equal groups: count the groups, then notice what each group holds.',
      block2: isGerman ? 'Wenn jede Gruppe gleich gross ist, darfst du wiederholt addieren oder kuerzer multiplizieren.' : 'When every group has the same size, repeated adding and multiplying are two views of the same idea.',
      block3: isGerman ? 'Zeichne die Gruppen. Lass den letzten Zaehlschritt bei dir, damit dein Gehirn den Klick macht.' : 'Draw the groups. Leave the final counting move to yourself so your brain gets the click.',
      analogy: isGerman ? 'Es ist wie Snack-Tabletts: gleiche Tabletts machen das Zaehlen fair und schnell.' : 'It is like snack trays: equal trays make counting fair, calm, and fast.',
      script: isGerman ? `Wir bauen ${problem} aus Gruppen. Erst die Gruppen, dann die Dinge in jeder Gruppe, dann der letzte Schritt von dir.` : `We build ${problem} from groups. First the groups, then what sits inside each group, then your final move.`,
      storyboardCaptions: ['Spot the groups', 'Fill each group', 'Repeat the same amount', 'Trade repeats for a shortcut', 'You finish the count'],
      videoPrompt: `Funny equal-groups explainer for: ${problem}`
    };
  }

  if (/(plant|photosynthesis|leaf|sunlight|chlorophyll|pflanze|blatt|sonnenlicht)/i.test(raw)) {
    return {
      subject: isGerman ? 'Biologie: Pflanzen-Energie' : 'Biology: Plant Energy',
      problem,
      icon: 'fa-leaf',
      block1: isGerman ? 'Eine Pflanze kann nicht zum Kuehlschrank laufen. Sie muss Licht, Luft und Wasser als Startteile benutzen.' : 'A plant cannot walk to the fridge. It uses light, air, and water as starting parts.',
      block2: isGerman ? 'Blaetter sind kleine Solar-Kuechen: Licht hilft, aus einfachen Teilen Zucker als Energie zu bauen.' : 'Leaves are tiny solar kitchens: light helps turn simple ingredients into sugar energy.',
      block3: isGerman ? 'Frag immer: Was kommt rein, was wird gebaut, und wofuer nutzt die Pflanze es?' : 'Ask: what goes in, what gets built, and what does the plant use it for?',
      analogy: isGerman ? 'Denk an eine grüne Mini-Kueche: Sonnenlicht ist der Strom, das Blatt ist die Werkbank.' : 'Think of a green mini-kitchen: sunlight is the power, the leaf is the counter.',
      script: isGerman ? `Bei ${problem} verfolgen wir die Zutaten: Licht, Wasser, Luft, dann Energie.` : `For ${problem}, we follow the ingredients: light, water, air, then energy.`,
      storyboardCaptions: ['Sunlight arrives', 'Leaves catch it', 'Simple ingredients enter', 'Sugar energy is built', 'Plant uses the energy'],
      videoPrompt: `Funny plant-energy first-principles explainer for: ${problem}`
    };
  }

  if (/(cell|organelle|mitochondria|nucleus|biology|zelle|zellkern)/i.test(raw)) {
    return {
      subject: isGerman ? 'Biologie: Zellen' : 'Biology: Cells',
      problem,
      icon: 'fa-cubes',
      block1: isGerman ? 'Eine Zelle ist eine winzige lebende Einheit. Sie braucht Grenze, Information, Energie und Arbeitsteilung.' : 'A cell is a tiny living unit. It needs a boundary, information, energy, and shared jobs.',
      block2: isGerman ? 'Organellen sind nicht Deko. Jedes Teil loest ein echtes Problem fuer das Ueberleben der Zelle.' : 'Organelles are not decoration. Each part solves a real survival problem for the cell.',
      block3: isGerman ? 'Verbinde jedes Teil mit seiner Aufgabe: Wer schuetzt, wer steuert, wer liefert Energie?' : 'Connect each part to its job: who protects, who directs, who powers the work?',
      analogy: isGerman ? 'Eine Zelle ist wie eine Mini-Stadt: Mauern, Rathaus, Kraftwerk und Lieferwege.' : 'A cell is like a mini city: walls, city hall, power station, and delivery roads.',
      script: isGerman ? `Wir machen ${problem} zur Mini-Stadt: Grenze, Steuerung, Energie, Arbeit.` : `We turn ${problem} into a mini city: boundary, control, energy, work.`,
      storyboardCaptions: ['Meet the cell city', 'Find the boundary', 'Find the control center', 'Find the power source', 'Match parts to jobs'],
      videoPrompt: `Funny cell-city explainer for: ${problem}`
    };
  }

  if (/(quantum|wave|particle|probability|superposition|quanten|welle|teilchen)/i.test(raw)) {
    return {
      subject: isGerman ? 'Physik: Quanten-Ideen' : 'Physics: Quantum Ideas',
      problem,
      icon: 'fa-lightbulb',
      block1: isGerman ? 'Quantenphysik startet klein: Bei winzigen Dingen beschreibt man oft Wahrscheinlichkeiten, nicht sichere Bahnen.' : 'Quantum thinking starts small: for tiny things, we often describe chances, not fixed paths.',
      block2: isGerman ? 'Eine Wellenfunktion ist wie eine Chancen-Karte. Sie sagt, wo ein Ergebnis wahrscheinlicher ist.' : 'A wavefunction is like a chance map. It tells where an outcome is more or less likely.',
      block3: isGerman ? 'Klaere zuerst: Was kann gemessen werden, und welche Moeglichkeiten gibt es vor der Messung?' : 'First ask: what can be measured, and what possibilities exist before measurement?',
      analogy: isGerman ? 'Wie ein unscharfer Scheinwerfer auf einer Buehne: vor dem Messmoment ist die Karte breiter als ein Punkt.' : 'Like a blurry spotlight on a stage: before measuring, the map is wider than one dot.',
      script: isGerman ? `Bei ${problem} bauen wir zuerst die Chancen-Karte, dann die Messidee, dann die Bedeutung.` : `For ${problem}, we build the chance map first, then measurement, then meaning.`,
      storyboardCaptions: ['Start with tiny scale', 'Draw a chance map', 'Ask what can be measured', 'Measurement picks an outcome', 'Explain the meaning'],
      videoPrompt: `Funny but accurate quantum first-principles explainer for: ${problem}`
    };
  }

  if (/(place value|digit|ones|tens|hundreds|stellenwert|zehner|hunderter)/i.test(raw)) {
    return {
      subject: isGerman ? 'Mathe: Stellenwert' : 'Math: Place Value',
      problem,
      icon: 'fa-table-columns',
      block1: isGerman ? 'Eine Ziffer ist das Zeichen. Der Platz gibt ihr den Job.' : 'A digit is the symbol. The place gives it the job.',
      block2: isGerman ? 'Einer zaehlen einzelne Dinge. Zehner zaehlen Buendel. Hunderter zaehlen grosse Buendel.' : 'Ones count singles. Tens count bundles. Hundreds count big bundles.',
      block3: isGerman ? 'Zeige die Zahl mit Buendeln. Dann wird der Wert sichtbar statt nur auswendig.' : 'Build the number with bundles. Then value becomes visible instead of memorized.',
      analogy: isGerman ? 'Wie ein Spieler: gleiche Person, andere Position, anderer Job.' : 'Like a player: same person, different position, different job.',
      script: isGerman ? `Bei ${problem} trennen wir Zeichen und Platz. Der Platz macht die Groesse.` : `For ${problem}, we separate symbol and place. The place creates the size.`,
      storyboardCaptions: ['See the digit', 'Find its column', 'Name the column job', 'Build bundles', 'Try another digit'],
      videoPrompt: `Funny place-value explainer for: ${problem}`
    };
  }

  return {
    subject: isGerman ? 'Erste-Prinzipien Aufgabe' : 'First-Principles Homework',
    problem,
    icon: 'fa-magnifying-glass',
    block1: isGerman ? 'Starte nicht mit der Loesung. Starte mit der Frage: Was soll wirklich verstanden oder gefunden werden?' : 'Do not start with the answer. Start with the target: what must be understood, found, or compared?',
    block2: isGerman ? 'Sammle nur die kleinen Fakten, die schon sicher sind. Die sind deine Bausteine.' : 'Collect only the small facts that are already true. Those are your building blocks.',
    block3: isGerman ? 'Mach einen kleinen Schritt, pruefe ihn, dann erst den naechsten. So bleibt das Gehirn dabei.' : 'Make one small move, check it, then take the next. That keeps the brain in the room.',
    script: isGerman ? `Wir nehmen ${problem}, finden die echte Frage, sammeln kleine Fakten und bauen Schritt fuer Schritt.` : `We take ${problem}, find the real question, collect tiny facts, and build step by step.`,
    storyboardCaptions: ['Name the mission', 'Collect tiny facts', 'Pick one rule', 'Try one move', 'Explain it back'],
    videoPrompt: `Funny first-principles explainer for: ${problem}`
  };
}

function localChatAnswer(analysis, message) {
  const subject = safeText(analysis.subject) || 'this topic';
  const problem = safeText(analysis.problem) || 'the problem';
  const blocks = Array.isArray(analysis.blocks) ? analysis.blocks : [];
  const firstBlock = blocks[0] ? `${safeText(blocks[0].title)}: ${safeText(blocks[0].body)}` : 'Start by naming the smallest idea.';
  const secondBlock = blocks[1] ? `${safeText(blocks[1].title)}: ${safeText(blocks[1].body)}` : 'Then connect the next small idea.';
  const analogy = safeText(analysis.analogy) || 'Think of it like building with small blocks: one steady piece at a time.';
  const lower = message.toLowerCase();
  const styles = [
    [
      `Let’s use detective mode.`,
      `The case: ${problem}`,
      `Clue 1: ${firstBlock}`,
      `Clue 2: ${secondBlock}`,
      `Now answer only this: which clue feels slippery? I will zoom into that one.`
    ],
    [
      `New angle: kitchen mode.`,
      `${subject} has ingredients, not magic.`,
      `Ingredient one is: ${firstBlock}`,
      `Ingredient two is: ${secondBlock}`,
      `Mix them slowly. If it tastes confusing, tell me which ingredient is weird.`
    ],
    [
      `Let’s shrink it to a tiny game level.`,
      `Mission sign: ${problem}`,
      `First button to press: ${firstBlock}`,
      `Door that opens next: ${secondBlock}`,
      `Bonus map: ${analogy}`
    ]
  ];
  const style = styles[hashNumber(lower) % styles.length];

  if (lower.includes('video') || lower.includes('walk') || lower.includes('again') || lower.includes('logic')) {
    return [
      `Totally fair. Same lesson, different movie.`,
      ...style,
      `Try this tiny reply: "I get clue 1" or "clue 2 is fuzzy".`
    ].join('\n');
  }

  return [
    `Good question. I will not repeat the same block list.`,
    ...style,
    `Next topic to unlock: find one everyday place where ${subject} quietly appears.`
  ].join('\n');
}

function normalizeAnalysis(input) {
  const analysis = fallbackAnalysis('');
  return {
    ...analysis,
    ...input,
    blocks: Array.isArray(input.blocks) && input.blocks.length ? input.blocks : analysis.blocks,
    questions: Array.isArray(input.questions) && input.questions.length ? input.questions : analysis.questions,
    storyboardCaptions:
      Array.isArray(input.storyboardCaptions) && input.storyboardCaptions.length === 5
        ? input.storyboardCaptions
        : analysis.storyboardCaptions
  };
}

function fallbackAnalysis(note) {
  return {
    subject: 'Homework Snapshot',
    problem: 'A homework image was captured. Real Grok analysis is not configured yet.',
    detected: 'Setup needed: add your xAI API key locally to turn this into real homework understanding.',
    blocks: [
      {
        title: 'Block 1: Read what is being asked',
        icon: 'fa-book-open-reader',
        body: 'Underline the actual question first. Ask whether it wants you to find, explain, compare, draw, or prove something.'
      },
      {
        title: 'Block 2: Find the tiny facts',
        icon: 'fa-cubes',
        body: 'List the small facts already given in the homework. First-principles thinking starts from facts that are already true.'
      },
      {
        title: 'Block 3: Make one careful move',
        icon: 'fa-shoe-prints',
        body: 'Use one fact to take one step, then check whether that step makes sense before moving on.'
      }
    ],
    analogy: 'Homework is like building a tower: a steady first block makes every next block easier.',
    questions: [
      'What is the problem asking for?',
      'What facts are already given?',
      'What one small step can you try next?'
    ],
    tryIt: 'Write the question in your own words. Then choose one tiny first step and explain why it makes sense.',
    script: note || 'FirstVid is ready for real AI once your local xAI key is added. Then it will read the captured homework and build a custom first-principles explanation.',
    storyboardCaptions: [
      'Capture a clear homework photo.',
      'Find the real question.',
      'Break it into tiny facts.',
      'Connect one idea at a time.',
      'Try the final move yourself.'
    ],
    videoPrompt: 'A friendly educational animation showing a child breaking homework into small building blocks, concise and encouraging, no final numerical answer shown.',
    parentNote: note,
    confidence: 0,
    safetyNote: 'No real AI analysis has run yet.'
  };
}

function constrainVideoPrompt(prompt) {
  return [
    'Create a funny, child-friendly educational explainer video.',
    'Make it as short as possible while still explaining the whole subject clearly.',
    'Structure: hook, first-principles idea, visual example, learner turn.',
    'Style: bright simple cartoon, low detail, fast motion, readable objects, playful but not chaotic.',
    'Stay strictly on the exact requested homework topic. Do not switch subjects or invent a generic lesson.',
    'Do not show a final numerical answer. Do not include scary or distracting elements.',
    'Focus on first principles and one simple visual analogy.',
    `Content: ${prompt.slice(0, 1400)}`
  ].join('\n');
}

function chooseVideoDuration(analysis, prompt) {
  const configured = process.env.FIRSTVID_VIDEO_SECONDS;
  if (configured && configured !== 'auto') {
    return Math.max(1, Math.min(15, Number(configured) || 10));
  }

  const text = [
    safeText(prompt),
    safeText(analysis && analysis.subject),
    safeText(analysis && analysis.problem)
  ].join(' ').toLowerCase();

  const complexSignals = [
    'quantum',
    'calculus',
    'university',
    'master',
    'proof',
    'derivative',
    'integral',
    'thermodynamics',
    'electromagnetic',
    'organic chemistry',
    'relativity'
  ];

  if (complexSignals.some((signal) => text.includes(signal)) || text.length > 1400) return 15;
  if (text.length > 650) return 12;
  return 8;
}

function buildGroundedVideoPrompt(analysis, fallbackPrompt) {
  if (!analysis) return fallbackPrompt;

  const subject = safeText(analysis.subject);
  const problem = safeText(analysis.problem);
  const script = safeText(analysis.script);
  const blocks = Array.isArray(analysis.blocks)
    ? analysis.blocks.map((block, index) => `${index + 1}. ${safeText(block.title)}: ${safeText(block.body)}`).join('\n')
    : '';
  const captions = Array.isArray(analysis.storyboardCaptions)
    ? analysis.storyboardCaptions.map((caption, index) => `Scene ${index + 1}: ${safeText(caption)}`).join('\n')
    : '';

  return [
    `MUST be about this exact homework subject: ${subject}`,
    `MUST explain this exact problem: ${problem}`,
    'Make the video understandable even without audio by showing clear visual steps.',
    'Show the concrete objects or concept from the problem. If the problem is about cookies, show cookies; if it is about plants, show plants.',
    'Do not switch to atoms, protons, generic classroom charts, or unrelated science/math topics unless the homework is actually about that.',
    'Funny visual gag: make the repeated idea obvious with a silly but relevant moment, like objects politely lining up in equal groups.',
    'On-screen text should be minimal: only short labels such as "groups", "same amount", "repeat", or "your turn".',
    'Do not reveal the final numerical answer.',
    '',
    'First-principles blocks to show:',
    blocks,
    '',
    'Storyboard beats:',
    captions,
    '',
    'Narration/script idea:',
    script || fallbackPrompt
  ].filter(Boolean).join('\n').slice(0, 2600);
}

function buildLessonCacheKey(imageDataUrl, textInput) {
  const imagePart = imageDataUrl && imageDataUrl.startsWith('data:image/') ? imageDataUrl : '';
  const textPart = safeText(textInput).toLowerCase();
  return hashText(`${LESSON_CACHE_VERSION}\n${textPart}\n${imagePart}`);
}

function buildVideoCacheKey(prompt, duration, resolution) {
  return hashText([
    VIDEO_CACHE_VERSION,
    process.env.XAI_VIDEO_MODEL || 'grok-imagine-video',
    duration,
    resolution,
    safeText(prompt)
  ].join('\n'));
}

function cachePath(kind, key) {
  const safeKind = kind.replace(/[^a-z0-9_-]/gi, '');
  const safeKey = key.replace(/[^a-f0-9]/gi, '');
  return path.join(CACHE_ROOT, safeKind, `${safeKey}.json`);
}

function readCacheEntry(kind, key) {
  try {
    const filePath = cachePath(kind, key);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`Could not read ${kind} cache: ${error.message}`);
    return null;
  }
}

function writeCacheEntry(kind, key, payload) {
  try {
    const filePath = cachePath(kind, key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({
      ...payload,
      createdAt: new Date().toISOString()
    }, null, 2));
  } catch (error) {
    console.warn(`Could not write ${kind} cache: ${error.message}`);
  }
}

function readVideoCache(key) {
  const cached = readCacheEntry('videos', key);
  if (!cached || !cached.videoUrl) return null;
  if (cached.videoUrl.startsWith('/generated/')) {
    const localPath = path.join(DATA_ROOT, cached.videoUrl.replace(/^\//, ''));
    return fs.existsSync(localPath) ? cached : null;
  }
  return cached.videoUrl.startsWith('http') ? null : cached;
}

function safeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeXaiApiKey(value) {
  const raw = String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^bearer\s+/i, '')
    .replace(/^["'`]+|["'`]+$/g, '');
  const match = raw.match(/xai-[A-Za-z0-9_.:-]+/i);
  return match ? match[0] : raw.replace(/\s+/g, '');
}

function shortenServer(text, max) {
  const value = safeText(text);
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function hashNumber(value) {
  return parseInt(hashText(value).slice(0, 8), 16);
}

function publicApiError(error) {
  const message = safeText(error && error.message);
  if (/401|unauthorized|authentication|invalid api key|invalid.*key|bearer/i.test(message)) return 'invalid-key';
  if (/credit|spending|quota|permission|403/i.test(message)) return 'credits-or-permission';
  if (/rate|429/i.test(message)) return 'rate-limited';
  return 'api-unavailable';
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const staticRoot = pathname.startsWith('/generated/') ? DATA_ROOT : ROOT;
  const filePath = path.normalize(path.join(staticRoot, pathname));

  if (!filePath.startsWith(staticRoot)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      return sendJson(res, 404, { error: 'Not found' });
    }
    const type = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type };
    if (['.html', '.js', '.webmanifest'].includes(path.extname(filePath).toLowerCase()) || path.basename(filePath) === 'sw.js') {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error('Request body is too large. Try a smaller image.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON request body.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function upsertEnvValue(filePath, key, value) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/) : [];
  let found = false;
  const escapedValue = String(value).replace(/\r?\n/g, '').trim();
  const nextLines = lines
    .filter((line, index) => index < lines.length - 1 || line.trim())
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.startsWith(`${key}=`)) return line;
      found = true;
      return `${key}=${escapedValue}`;
    });
  if (!found) nextLines.push(`${key}=${escapedValue}`);
  fs.writeFileSync(filePath, `${nextLines.join('\n')}\n`);
}

module.exports = {
  server,
  startServer
};
