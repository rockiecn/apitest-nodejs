var events = require('events')
var needle = require('needle');
const chalk = require("chalk")
const progressStream = require('progress-stream')
// for send request
const fetch = require("node-fetch")

var fs = require('fs');
// form data
var FormData = require('form-data');

// for hash and sign
const { keccak256, ecsign, isValidPrivate, privateToPublic} = require('ethereumjs-util')

//
const host = "http://localhost:8081"
const addr = "0x72104761e700Fb96E10Da5960f25746e87c1943A"
const sk = "2ac034f466c964e913f86442ccd772824c4a8275c0b107aa1b4b9a0b5e84b454"

var accessToken
var refreshToken

// new event emitter
var eventEmitter = new events.EventEmitter();

// use fetch to send challenge request
var onChallenge = function() {
  console.log("-> sending challenge request to get message")
  fetch(
  //"http://api.mefs.io:18080/challenge?address=0x0090675FD3ef5031d7719A758163E73Fd58AF1EB",
  host+"/challenge?address="+addr,
  {
    method: "GET",
    headers: { Origin: "http://mefs.io" },
  }
  )
  .then(async res => {
    // get challenge response msg
    var msg = await res.text()

    // message
    //console.log('-> challenge response message:\n', msg)

    // sign msg with sk, used to login

    // sk of user node
    const privKey = Buffer.alloc(32, sk, 'hex')
    const pubKey = privateToPublic(privKey)
    console.log("-> pubkey:" + pubKey.toString('hex'))
    // check if sk is valid for secp256k1 rule
    console.log(isValidPrivate(privKey))

    // sign function
    const sign = (msgHash, privKey) => {
      if (typeof msgHash === 'string' && msgHash.slice(0, 2) === '0x') {
        msgHash = Buffer.alloc(32, msgHash.slice(2), 'hex')
      }
      const sig = ecsign(msgHash, privKey)
      return `0x${sig.r.toString('hex')}${sig.s.toString('hex')}${sig.v.toString(16)}`
    }

    // construct etherum signed msg
    var ethMsg = "\x19Ethereum Signed Message:\n" + msg.length + msg
    // transfer msg to buf for keccak256
    const buf = Buffer.from(ethMsg)
   // console.log("-> eth message buffer:\n" + buf)

    // calc hash with buffer
    console.log("-> calc hash")
    const hash = '0x' + keccak256(buf).toString('hex')

    // sign for hash with sk
    const sig = sign(hash, privKey)

    console.log('-> keccak256("hash"): ' + hash)
    console.log('-> signature: ' + sig)

    // send login event
    console.log(chalk.bgMagenta("emitting login event.."))
    eventEmitter.emit('login',msg,sig);

  })
  .catch((e) => {
    console.log("error:",e)
    console.log(chalk.bgRed('challenge test FAILED'))
});
}

// use fetch to send login request
var onLogin = function(msg,sig) {
  console.log("-> msg:")
  //console.log(msg)
  console.log("-> sig:")
  console.log(sig)
  // request body
  var data = {
    "message":msg,
    "signature":sig
  }

  console.log("-> 2.sending login request to get accessToken and refreshToken")
  fetch(
  host + "/login",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body:JSON.stringify(data),
    }
  )
  .then(res => res.json())
  .then(json => {
    console.log("response from login:")
    console.log(json)
    // record tokens
    accessToken=json["accessToken"]
    refreshToken=json["refreshToken"]

    // emit list event
    console.log(chalk.bgMagenta("emitting store info event.."))
    eventEmitter.emit("storeInfo")
  })
  .catch((e) => {
      console.log("error:",e)
      console.log(chalk.bgRed('login test FAILED'))
  });
}

// storage info request
var onStoreInfo = function() {
  fetch(host+"/mefs/storageinfo", {
    method: "GET",
    headers: {"Authorization":"Bearer " + accessToken}
  })
  .then(res => res.json())
  .then(json => {
    console.log(json)

    // emit balance request
    console.log(chalk.bgMagenta("emitting balance event.."))
    eventEmitter.emit("balance")
  })
  .catch((e) => {
    console.log("error:",e)
    console.log(chalk.bgRed('storageInfo test FAILED'))
});
}

// account balance request
var onBalance = function() {
  fetch(host+"/mefs/balance", {
    method: "GET",
    headers: {"Authorization":"Bearer " + accessToken}
  })
  .then(res => res.json())
  .then(json => {
    console.log(json)

    // emit get buypkgs
    console.log(chalk.bgMagenta("emitting get buy pkgs event.."))
    eventEmitter.emit("getbuypkgs")
  })
  .catch((e) => {
    console.log("error:",e)
    console.log(chalk.bgRed('balance test FAILED'))
});
}

// get buy pkgs request
var onGetBuyPkgs = function() {
  fetch(host+"/mefs/getbuypkgs", {
    method: "GET",
    headers: {"Authorization":"Bearer " + accessToken}
  })
  .then(res => res.json())
  .then(json => {
    console.log('total packages:' + json.length)

    // emit buy pkg event
    console.log(chalk.bgMagenta("emitting buy pkg event.."))
    eventEmitter.emit("buypkg")
  })
  .catch((e) => {
    console.log("error:",e)
    console.log(chalk.bgRed('getBuyPkgs test FAILED'))
});
}

// buy pkg request
var onBuyPkg = function() {
  
  fetch(host+"/mefs/buypkg?amount=1&pkgid=1&chainid=985", {
    method: "GET",
    headers: {"Authorization":"Bearer " + accessToken}
  })
  .then(res => res.text())
  .then(text => {
    console.log("Buy pkg OK, receipt:"+text)

    // emit flow  event
    console.log(chalk.bgMagenta("emitting flow event.."))
    eventEmitter.emit("flow")
  })
  .catch((e) => {
    console.log("error:",e)
    console.log(chalk.bgRed('buyPkg test FAILED'))
});
}

// flow request
var onFlow = function() {
  fetch(host+"/mefs/flowsize?stype=mefs", {
    method: "GET",
    headers: {"Authorization":"Bearer " + accessToken}
  })
  .then(res => res.json())
  .then(json => {
    console.log(json)

    console.log(chalk.bgMagenta("emitting upload event.."))
    eventEmitter.emit("upload")

  })
  .catch((e) => {
    console.log("error:",e)
    console.log(chalk.bgRed('flow test FAILED'))
});
}


// upload, OK
var onUpload = async function () {
  let fileStream = fs.readFileSync("./test.png");//读取文件
  console.log("file length:" + fileStream.length)
  let formdata = new FormData();
  formdata.append("file", fs.createReadStream('./test.png'), "test.png");
  formdata.append('public','true')

  // send request
  var headers = formdata.getHeaders()
  headers.Authorization = 'Bearer ' + accessToken
  fetch(host + "/mefs/", {
      body: formdata,
      method: "POST",//请求方式
      headers: headers
  }).then((res) => {
      return res.text();
  }).then(text => {
    console.log(text)

    // emit list objects event
    console.log(chalk.bgMagenta("emitting list objects event.."))
    eventEmitter.emit("lsobj")
  })
  .catch((e) => {
    console.log("error:",e)
    console.log(chalk.bgRed('upload test FAILED'))
  });
}


// list objects
var onLsObj = async function () {
  fetch(host + "/mefs/listobjects", {
      method: "GET",
      headers: {"Authorization":"Bearer " + accessToken},
  })
  .then(res => res.json())
  .then(json => {
      console.log(json)

      // emit delete object event
      console.log(chalk.bgMagenta("emitting download event.."))
      eventEmitter.emit("download")
    })
    .catch((e) => {
      console.log("error:",e)
      console.log(chalk.bgRed('lsObj test FAILED'))
  });
}

// download
var onDownload = async function () {
  fetch(
    // url
    host + '/mefs/bafkreiev4izefkqu32pxad5rsuusxmxo2o4nqe2szhclkhwqf3uaz5s574',
    // options
    {
        method: "GET",
        headers: {"Authorization":"Bearer " + accessToken},
    },
    )
  .then(res => {
    const target = './dd'
    // create file stream
    const fileStream = fs.createWriteStream(target).on('error', function(e) {
      console.error('错误', e)
    }).on('ready', function() {
      console.log("开始下载:");
    }).on('finish', function() {
      console.log('文件下载完成，文件名：' + target);

      // emit public download event
      console.log(chalk.bgMagenta("emitting public download event.."))
      eventEmitter.emit("public")
    });

    // get file size
    let length = res.headers.get("content-length");
    let str = progressStream({
      length,time: 100
    });

    // progress bar
    str.on('progress', function(progressData) {
      let percentage = Math.round(progressData.percentage) + '%';
      console.log(percentage);
    });
    res.body.pipe(str).pipe(fileStream);
  })
  .catch((e) => {
    console.log("error:",e)
    console.log(chalk.bgRed('download test FAILED'))
  });
}



// public download
var onPublic = async function () {
  fetch(
    // url
    host + '/mefs/public/bafkreiev4izefkqu32pxad5rsuusxmxo2o4nqe2szhclkhwqf3uaz5s574?chainid=985',
    // options
    {
        method: "GET",
        headers: {"Authorization":"Bearer " + accessToken},
    },
    )
  .then(res => res.buffer())
  .then(_ => {
    console.log('下载文件')
    const target = './ff'
    fs.writeFile(target, _, 'binary', function(err) {
      if (err) {
        console.error(err);
      }
      else {
        console.log('下载完成，文件名：' + target)
        // emit delete object event
        console.log(chalk.bgMagenta("emitting delete object event.."))
        eventEmitter.emit("delete")
      }
    });
  })
  .catch((e) => {
    console.log("error:",e)
    console.log(chalk.bgRed('public download test FAILED'))
  });
}

// delete objects
var onDelete = async function () {
  fetch(
    // url
    host + "/mefs/delete?" + new URLSearchParams({'mid': 'bafkreiev4izefkqu32pxad5rsuusxmxo2o4nqe2szhclkhwqf3uaz5s574'}), 
    // options
    {
        method: "GET",
        headers: {"Authorization":"Bearer " + accessToken},
    },
    )
  .then(res => res.json())
  .then(json => {
      console.log(json)

      // pkg infos
      console.log(chalk.bgMagenta("emitting pkg infos event.."))
      eventEmitter.emit("pkginfos")

    })
    .catch((e) => {
      console.log("error:",e)
      console.log(chalk.bgRed('delete test FAILED'))
  });
}

// pkg infos
var onPkgInfos = async function () {
  fetch(
    // url
    host + '/mefs/pkginfos',
    // options
    {
        method: "GET",
        headers: {"Authorization":"Bearer " + accessToken},
    },
    )
  .then(res => res.json())
  .then(json => {
      console.log(json)

      // // public download
      // console.log(chalk.bgMagenta("emitting public download event.."))
      // eventEmitter.emit("public")
    })
    .catch((e) => {
      console.log("error:",e)
      console.log(chalk.bgRed('pkgInfos test FAILED'))
  });
}



// bind event and handler
eventEmitter.on('challenge', onChallenge)
eventEmitter.on("login",onLogin)
eventEmitter.on("download",onDownload)
eventEmitter.on("storeInfo",onStoreInfo)
eventEmitter.on("balance",onBalance)
eventEmitter.on("getbuypkgs",onGetBuyPkgs)
eventEmitter.on("buypkg",onBuyPkg)
eventEmitter.on("flow",onFlow)
eventEmitter.on("upload",onUpload)
eventEmitter.on("lsobj",onLsObj)
eventEmitter.on("delete",onDelete)
eventEmitter.on("pkginfos",onPkgInfos)
eventEmitter.on("public",onPublic)

// emit challenge event to start
console.log('                ' + chalk.bgGreen('=================='))
console.log('                ' + chalk.bgGreen('Backend Test Start'))
console.log('                ' + chalk.bgGreen('=================='))
console.log()
console.log(chalk.bgMagenta("emitting challenge event"))
eventEmitter.emit('challenge');
