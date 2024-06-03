const axios = require('axios');
var data = JSON.stringify({
  "conversation_id": "123",
  "bot_id": "7375049088703741960",
  "user": "123333333",
  "query": "What's tennis?",
  "stream": false
});

var config = {
  method: 'post',
  maxBodyLength: Infinity,
  url: 'https://api.coze.com/open_api/v2/chat',
  headers: { 
    'Authorization': 'Bearer pat_fiGlPSAhjuypBdrskqa0mrk1xuG4AHVfH4HTQsU3ycrd05AKUO5DVRdctCzXOV65', 
    'Content-Type': 'application/json'
  },
  data : data,
  timeout: 50000
};

axios.request(config)
.then((response) => {
  console.log(JSON.stringify(response.data));
})
.catch((error) => {
  console.log(error);
});
