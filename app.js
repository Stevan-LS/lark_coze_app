// server.js
const express = require("express");
const lark = require("@larksuiteoapi/node-sdk");
const axios = require("axios");
const { Pool } = require('pg');
require('dotenv').config();

const LARK_APP_ID = process.env.LARK_APP_ID_PERSO; // Larksuite appid 
const LARK_APP_SECRET = process.env.LARK_APP_SECRET_PERSO; // larksuite app secret
const COZE_PAT = process.env.COZE_PAT;
const BOT_ID = process.env.BOT_ID;
const MAX_TOKEN = process.env.MAX_TOKEN;

const app = express();
const port = process.env.PORT || 4000;

const poolConfig = {
  max: 1,
  min: 1,
  idleTimeoutMillis: 600000,
  connectionString: `postgres://${process.env.PG_USER}:${process.env.PG_PASSWORD}@${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_DATABASE}?sslmode=no-verify`
};

const pool = new Pool(poolConfig);

// Middleware to parse JSON bodies
app.use(express.json());

app.post('/', async (req, res) => {
  try {
    const params = req.body;
    const context = {}; // Context can include additional info if needed
    const result = await module.exports(params, context);
    res.json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

const larkClient = new lark.Client({
  appId: LARK_APP_ID,
  appSecret: LARK_APP_SECRET,
  disableTokenCache: false,
  domain: lark.Domain.Lark
});

function logger(param) {
  console.error(`[CF]`, param);
}

async function reply(messageId, content) {
  try {
    return await larkClient.im.message.reply({
      path: {
        message_id: messageId,
      },
      data: {
        content: JSON.stringify({
          text: content,
        }),
        msg_type: "text",
      },
    });
  } catch (e) {
    logger("send message to Lark error", e, messageId, content);
  }
}

// Use Session ID to build conversation
function buildConversation(sessionId, question) {
  let prompt = [];
  const query = 'SELECT question, answer FROM messages WHERE session_id = $1';
  const values = [sessionId];

  return new Promise((resolve, reject) => {
    pool.query(query, values, (error, results) => {
      if (error) {
        reject(error);
      } else {
        results.rows.forEach((conversation) => {
          prompt.push({ role: "user", content: conversation.question, content_type: "text" });
          prompt.push({ role: "assistant", type: "answer", content: conversation.answer, content_type: "text" });
        });
        prompt.push({ role: "user", content: question, content_type: "text" });
        resolve(prompt);
      }
    });
  });
}

// Save conversation
function saveConversation(sessionId, question, answer) {
  const msgSize = question.length + answer.length;
  const insertQuery = 'INSERT INTO messages (session_id, question, answer, message_size) VALUES ($1, $2, $3, $4)';
  const values = [sessionId, question, answer, msgSize];

  return new Promise((resolve, reject) => {
    pool.query(insertQuery, values, (error, results) => {
      if (error) {
        reject(error);
      } else {
        discardConversation(sessionId)
          .then(() => resolve(results))
          .catch(reject);
      }
    });
  });
}

// Discard conversation if history size over max_token
function discardConversation(sessionId) {
  let totalSize = 0;
  const countList = [];
  const query = 'SELECT id, message_size FROM messages WHERE session_id = $1 ORDER BY created_at DESC';
  const values = [sessionId];

  return new Promise((resolve, reject) => {
    pool.query(query, values, async (error, results) => {
      if (error) {
        reject(error);
      } else {
        results.rows.forEach((msg) => {
          totalSize += parseInt(msg.message_size);
          countList.push({
            msgId: msg.id,
            totalSize,
          });
        });

        for (const c of countList) {
          if (c.totalSize > MAX_TOKEN) {
            const deleteQuery = 'DELETE FROM messages WHERE id = $1';
            await new Promise((deleteResolve, deleteReject) => {
              pool.query(deleteQuery, [c.msgId], (deleteError) => {
                if (deleteError) {
                  deleteReject(deleteError);
                } else {
                  deleteResolve();
                }
              });
            });
          }
        }

        resolve();
      }
    });
  });
}

// Clean old conversation
function clearConversation(sessionId) {
  const deleteQuery = 'DELETE FROM messages WHERE session_id = $1';
  const values = [sessionId];

  return new Promise((resolve, reject) => {
    pool.query(deleteQuery, values, (error, results) => {
      if (error) {
        reject(error);
      } else {
        resolve(results.rowCount);
      }
    });
  });
}

// Command process
async function cmdProcess(cmdParams) {
  switch (cmdParams && cmdParams.action) {
    case "/help":
      await cmdHelp(cmdParams.messageId);
      break;
    case "/clear":
      await cmdClear(cmdParams.sessionId, cmdParams.messageId);
      break;
    default:
      await cmdHelp(cmdParams.messageId);
      break;
  }
  return { code: 0 };
}

// Help command
async function cmdHelp(messageId) {
  const helpText = `Lark GPT manpages

Usage:
    /clear    remove conversation history for get a new, clean, bot context.
    /help     get more help message
  `;
  await reply(messageId, helpText);
}

// Clear command
async function cmdClear(sessionId, messageId) {
  await clearConversation(sessionId);
  await reply(messageId, "✅ All history removed");
}

// Get Coze reply
async function getCozeReply(question, chatHistory, sessionId, senderId) {
  const data = JSON.stringify({
    "conversation_id": sessionId,
    "bot_id": BOT_ID,
    "user": senderId,
    "query": question,
    "chat_history": chatHistory,
    "stream": false
  });

  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: 'https://api.coze.com/open_api/v2/chat',
    headers: {
      'Authorization': `Bearer ${COZE_PAT}`,
      'Content-Type': 'application/json'
    },
    data: data,
    timeout: 50000
  };

  try {
    const response = await axios(config);
    logger(JSON.stringify(response));

    if (response.status === 429) {
      return 'Too many question, can you wait and re-ask later?';
    }

    if (response.data && response.data.messages) {
      const answerMessage = response.data.messages.find(message => message.type === "answer");
      if (answerMessage) {
        return answerMessage.content;
      } else {
        return 'No answer found in the response';
      }
    } else {
      return 'Unexpected response structure';
    }
  } catch (e) {
    logger(e.response.data);
    return "this question is too difficult, you may ask my owner.";
  }
}

// Self check doctor
async function doctor() {
  if (LARK_APP_ID === "") {
    return {
      code: 1,
      message: {
        en_US: "Here is no Lark APP id, please check & re-Deploy & call again",
      },
    };
  }
  if (!LARK_APP_ID.startsWith("cli_")) {
    return {
      code: 1,
      message: {
        en_US: "Your Lark App ID is Wrong, Please Check and call again. Lark APPID must Start with cli",
      },
    };
  }
  if (LARK_APP_SECRET === "") {
    return {
      code: 1,
      message: {
        en_US: "Here is no Lark APP Secret, please check & re-Deploy & call again",
      },
    };
  }
  if (COZE_PAT === "") {
    return {
      code: 1,
      message: {
        en_US: "Here is no Coze Key, please check & re-Deploy & call again",
      },
    };
  }
  if (!COZE_PAT.startsWith("pat_")) {
    return {
      code: 1,
      message: {
        en_US: "Your COZE Key is Wrong, Please Check and call again. Lark APPID must Start with cli",
      },
    };
  }
  return {
    code: 0,
    message: {
      en_US: "✅ Configuration is correct, you can use this bot in your Lark App",
    },
    meta: {
      LARK_APP_ID,
      MAX_TOKEN,
    },
  };
}

async function handleReply(userInput, sessionId, messageId, eventId, senderId) {
  const question = userInput.text.replace("@_user_1", "");
  logger("question: " + question);

  const action = question.trim();
  if (action.startsWith("/")) {
    return await cmdProcess({ action, sessionId, messageId });
  }

  const chatHistory = await buildConversation(sessionId, question);

  const cozeResponse = await getCozeReply(question, chatHistory, sessionId, senderId);

  await saveConversation(sessionId, question, cozeResponse);

  await reply(messageId, cozeResponse);

  // Update content to the event record
  const selectQuery = 'SELECT * FROM events WHERE event_id = $1';
  return new Promise((resolve, reject) => {
    pool.query(selectQuery, [eventId], (selectError, results) => {
      if (selectError) {
        reject(selectError);
      } else {
        if (results.rows.length === 0) {
          reject(new Error('Event not found'));
        } else {
          const evt_record = results.rows[0];
          evt_record.content = userInput.text;

          const updateQuery = 'UPDATE events SET content = $1 WHERE event_id = $2';
          pool.query(updateQuery, [evt_record.content, eventId], (updateError) => {
            if (updateError) {
              reject(updateError);
            } else {
              resolve({ code: 0 });
            }
          });
        }
      }
    });
  });
}

module.exports = async function (params, context) {
  //  if have a encrypt, let use close it.
  if (params.encrypt) {
    logger("user enable encrypt key");
    return {
      code: 1,
      message: {
        en_US: "You have open Encrypt Key Feature, please close it.",
      },
    };
  }
  // process url_verification
  if (params.type === "url_verification") {
    logger("deal url_verification");
    return {
      challenge: params.challenge,
    };
  }
  // build a doctor for debug
  if (!params.hasOwnProperty("header") || context.trigger === "DEBUG") {
    logger("enter doctor");
    return await doctor();
  }
  // process event
  if ((params.header.event_type === "im.message.receive_v1")) {
    let eventId = params.header.event_id;
    let messageId = params.event.message.message_id;
    let chatId = params.event.message.chat_id;
    let senderId = params.event.sender.sender_id.user_id;
    let sessionId = chatId + senderId;

    try {
      // Check if the event already exists in the database
      const query = 'SELECT COUNT(*) as count FROM events WHERE event_id = $1';
      const { rows } = await pool.query(query, [eventId]);
      const count = rows[0].count;
      if (count != 0) {
        logger('Skip repeat event');
        return { code: 1 };
      } else {
        // Insert a new record into the database
        const insertQuery = 'INSERT INTO events (event_id) VALUES ($1)';
        await pool.query(insertQuery, [eventId]);
      }
    } catch (error) {
      throw error;
    }

    // replay in private chat
    if (params.event.message.chat_type === "p2p") {
      // don't reply except text
      if (params.event.message.message_type != "text") {
        await reply(messageId, "Not support other format question, only text.");
        logger("skip and reply not support");
        return { code: 0 };
      }
      // reply text
      const userInput = JSON.parse(params.event.message.content);
      return await handleReply(userInput, sessionId, messageId, eventId, senderId);
    }

    // group chat process
    if (params.event.message.chat_type === "group") {
      const userInput = JSON.parse(params.event.message.content);
      return await handleReply(userInput, sessionId, messageId, eventId, senderId);
    }
  }

  logger("return without other log");
  return {
    code: 2,
  };
};
