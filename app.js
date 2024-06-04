const express = require('express')
const app = express()
const port = process.env.PORT || 4000;

const lark = require("@larksuiteoapi/node-sdk");

const axios = require("axios");

const LARK_APP_ID = 'cli_a6df832907f8d010'; // Larksuite appid 

const LARK_APP_SECRET = 'q8wXFw1TaIvUDCQnIvprOf1aLlEZvBlj'; // larksuite app secret

const COZE_PAT = 'pat_fiGlPSAhjuypBdrskqa0mrk1xuG4AHVfH4HTQsU3ycrd05AKUO5DVRdctCzXOV65'; // Coze personal access token

const BOT_ID = '7375049088703741960';
const MAX_TOKEN = 1024; //  Max token param 

// Middleware to parse JSON bodies
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!')
})

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
  console.log(`Example app listening on port ${port}`)
})


const client = new lark.Client({

  appId: LARK_APP_ID,

  appSecret: LARK_APP_SECRET,

  disableTokenCache: false,

  domain: lark.Domain.Lark

});



function logger(param) {

  console.error(`[CF]`, param);

}

async function reply(messageId, content) {

  try{

    return await client.im.message.reply({

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

  } catch(e){

    logger("send message to Lark error",e,messageId,content);

  }

}





// Use Session ID to build coversation

async function buildConversation(sessionId, question) {

  let prompt = [];
  // build the latest question

  prompt.push({"role": "user", "content": question})

  return prompt;

}



//  save conversation

async function saveConversation(sessionId, question, answer) {

  const msgSize =  question.length + answer.length

  const result = await MsgTable.save({

    sessionId,

    question,

    answer,

    msgSize,

  });

  if (result) {

    // check and discard old conversation

    await discardConversation(sessionId);

  }

}



// if histroy size over max_token, drop the first question in conversation

async function discardConversation(sessionId) {

  let totalSize = 0;

  const countList = [];

  const historyMsgs = await MsgTable.where({ sessionId }).sort({ createdAt: -1 }).find();

  const historyMsgLen = historyMsgs.length;

  for (let i = 0; i < historyMsgLen; i++) {

    const msgId = historyMsgs[i]._id;

    totalSize += historyMsgs[i].msgSize;

    countList.push({

      msgId,

      totalSize,

    });

  }

  for (const c of countList) {

    if (c.totalSize > MAX_TOKEN) {

      await MsgTable.where({_id: c.msgId}).delete();

    }

  }

}



// clean old conversation

async function clearConversation(sessionId) {

  return await MsgTable.where({ sessionId }).delete();

}



// command process

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

  return { code: 0 }

} 



// help command

async function cmdHelp(messageId) {

  helpText = `Lark GPT manpages



Usage:

    /clear    remove conversation history for get a new, clean, bot context.

    /help     get more help message

  `

  await reply(messageId, helpText);

}





async function cmdClear(sessionId, messageId) {

  await clearConversation(sessionId)

  await reply(messageId, "✅ All history removed");

}



// get coze reply

async function getCozeReply(prompt) {


  var data = JSON.stringify({
    "conversation_id": "123",
    "bot_id": BOT_ID,
    "user": "123333333",
    "query": prompt,
    "stream": false
  });
  
  var config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: 'https://api.coze.com/open_api/v2/chat',
    headers: { 
      'Authorization': `Bearer ${COZE_PAT}`, 
      'Content-Type': 'application/json'
    },
    data : data,
    timeout: 50000
  };


  try{

      const response = await axios(config);

    

      if (response.status === 429) {

        return 'Too many question, can you wait and re-ask later?';

      }
      logger("response: " + response);

      if (response.data && response.data.messages) {
        // Find the first message with the type "answer"
        const answerMessage = response.data.messages.find(message => message.type === "answer");
        if (answerMessage) {
          return answerMessage.content;
        } else {
          return 'No answer found in the response';
        }
      } else {
        return 'Unexpected response structure';
      }
  }catch(e){

     logger(e.response.data)

     return "this question is too diffcult, you may ask my owner.";

  }

}


// self check doctor

async function doctor() {

  if (LARK_APP_ID === "") {

    return {

      code: 1,

      message: {

        en_US:

          "Here is no Lark APP id, please check & re-Deploy & call again",

      },

    };

  }

  if (!LARK_APP_ID.startsWith("cli_")) {

    return {

      code: 1,

      message: {

        en_US:

          "Your Lark App ID is Wrong, Please Check and call again. Lark APPID must Start with cli",

      },

    };

  }

  if (LARK_APP_SECRET === "") {

    return {

      code: 1,

      message: {

        en_US:

          "Here is no Lark APP Secret, please check & re-Deploy & call again",

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

        en_US:

          "Your COZE Key is Wrong, Please Check and call again. Lark APPID must Start with cli",

      },

    };

  }

  return {

    code: 0,

    message: {

      en_US:

      "✅ Configuration is correct, you can use this bot in your Lark App",

      

    },

    meta: {

      LARK_APP_ID,

      MAX_TOKEN,

    },

  };

}

async function handleReply(userInput, sessionId, messageId, eventId) {

  const question = userInput.text.replace("@_user_1", "");

  logger("question: " + question);

  logger("userInput: " + userInput);

  const action = question.trim();

  if (action.startsWith("/")) {

    return await cmdProcess({action, sessionId, messageId});

  }

  const prompt = await buildConversation(sessionId, question);

  const cozeResponse = await getCozeReply(prompt);

  await reply(messageId, cozeResponse);



  // update content to the event record

  return { code: 0 };

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

      return await handleReply(userInput, sessionId, messageId, eventId);

    }



    // group chat process

    if (params.event.message.chat_type === "group") {

      const userInput = JSON.parse(params.event.message.content);

      return await handleReply(userInput, sessionId, messageId, eventId);

    }

  }



  logger("return without other log");

  return {

    code: 2,

  };

};