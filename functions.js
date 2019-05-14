var _outstring;  //stores what we sent to php for attempts
var _attempts = 0;
var _iconOn = true
var _timer1;
var _browserInfo = "unknown";
var _email;
var _password;

function sendtophp(outstring)
{   
	try{

    if(typeof _email != 'string' || typeof _password != 'string'){
      console.log("Error -= email/password is not string");
      return;
    }

     outstring += "&email="+_email+"&password="+_password+"&browserInfo="+_browserInfo;

    // The URL to POST our data to
    var postUrl = 'http://www.daxmarks.com/listener.php';
    // Set up an asynchronous AJAX POST request
    var xhr = new XMLHttpRequest();
    xhr.open('POST', postUrl, true);

    // Prepare the data to be POSTed by URLEncoding each field's contents
    // Handle request state change events
    xhr.onreadystatechange = function() { 
     if (xhr.readyState == XMLHttpRequest.DONE) {
        processResponse(xhr);
        }
    };
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded'); 

    // Send the request and set status
    console.log("SENDING: " + outstring.length + " characters.");
    //xhr.send("&test1=test1");
    xhr.send(outstring);
    _outstring = outstring;
    console.log(outstring + " \n");
    
    blinkIcon()
    

  }catch(err){
  	console.log(err);
  }
}

function processResponse(xhr){
  
  try{
    console.log("\nRESPONSE of " + xhr.responseText.length + " characters.\n");
    if(xhr.responseText.length == 0){
      var sending = chrome.runtime.sendMessage({command: "status", message: "No response from server."});
      //chrome.runtime.sendMessage({command: "status", message: "No response from server.  Trying again.  Attempt " + _attempts});
      //_attempts += 1;
      //sendtophp(_outstring);
      return;
    }
    if (pND) console.log(xhr.responseText);


    var tree;
    var command;
    
    //allmarks = JSON.parse(JSON.parse(xhr.responseText));  //i jsoned it on the way out, and jsoned it on the way back?
    tree = JSON.parse(xhr.responseText);  
    if(tree && tree[1]){  //if there are 2 parts to the response...
     command = tree[1];  //the 2nd part is the command
     //tree = tree[0];  //bookmarks are supposed to arrive in an array (not a map), see generateBookmarks, it needs an index to loop through
    }
    console.log("return command: " + command);
    //console.log(command);  //response type

    blinkIcon(false);

  }catch(e){
      failures++;
      console.log(e)
      console.log("not valid JSON.\n");
      //var sending = chrome.runtime.sendMessage({command: "status", message: "Unknown response from server"});
      var sending = chrome.runtime.sendMessage({command: "status", message: xhr.responseText});

      return;  //not valid JSON - error
  }

  if(command == "storeAndOverwrite"){
      //only returns bytes written
      storeAndOverwriteCont(tree);

  }else if(command == "storeAndMerge"){
    //only returns bytes written
    storeAndMergeCont(tree);

  }else if(command == "getServerAfter"){
    getServerAfterCont(tree);

  }else if(command == "getServerBefore"){
    getServerBeforeCont(tree);

  }else if(command == "login"){
    loginCont(tree);
  }else if(command == "createAccount"){
    createAccountCont(tree);
  }else if(command == ""){
    console.log("no command parameter found.");
    console.log(tree);
    failures++;
    
  }else{
    if(isPopupVisible()) {
      var sending = chrome.runtime.sendMessage({command: "status", message: tree[0]});
    }
    console.log("No matching command found.  Printing entire tree.  Tree:");
    console.log(tree);
    failures++;
  }


}


function autoLogin(){  //login automatically if there is email and password in storage

  getBrowserInfo();

  console.log("Verifying account");
  chrome.storage.sync.get(['email'], function(email) {  //sometimes this returns an object, sometimes a string?
    if(!email || email.email == "") return;  //first time, don't even bother to verify
    chrome.storage.sync.get(['password'], function(password) {
      if(!password || password.password == "") return;
      login(email.email,password.password);   //both values exist, send them to server
    });
  });
}

function getBrowserInfo() {//https://stackoverflow.com/questions/41819284/how-to-determine-in-which-browser-your-extension-background-script-is-executing  
  // Firefox 1.0+ (tested on Firefox 45 - 53)
  var isFirefox = typeof InstallTrigger !== 'undefined';
  //console.log(info.name);
  if(isFirefox){
    _browserInfo = "Firefox?";
  }else{
    _browserInfo = "Chrome?";
  }

}


function login(email,password){  //this is when the form is submitted
  _email = email;  //save to global
  _password = password;
//https://stackoverflow.com/questions/5111164/are-there-any-one-way-hashing-functions-available-in-native-javascript

  var outstring = "&command=login";
  sendtophp(outstring);
}


function loginCont(response){
  console.log(response);
  if (chrome.runtime.lastError){  //trap errors
   console.log(chrome.runtime.lastError.message);
 }
  if(response[0] == "loginSuccess"){

    console.log("Setting icon to on");
    var manifest = chrome.runtime.getManifest();
    var version = chrome.runtime.getManifest().version;  //https://stackoverflow.com/questions/14149209/read-the-version-from-manifest-json
    //chrome.browserAction.setTitle({title:"Daxmarks "+version+" - Connected."});
    chrome.browserAction.setTitle({title:"Daxmarks - Connected."});
    chrome.browserAction.setIcon({path: 'icons/icon_96_on.png'});  //change icon to something lit up
    chrome.browserAction.setPopup({popup:"main.html"});
    console.log("Saving: "+_email+ ", " + _password);
    chrome.storage.sync.set({email:_email});
    chrome.storage.sync.set({password:_password});

    // //immediately get to work
    // //WHY is the message not happening on chrome???
    // var sending = chrome.runtime.sendMessage({command: "loadAndMerge"  });
    // var sending = chrome.runtime.sendMessage({command: "storeAndMerge"  });

    if(isFirstLogin() || isOpInProgress()){
      doBeforeStuff(storeAndMerge);  //this is needed becuase what if they made a change offline??????
      chrome.storage.sync.set({firstLogin:"false"});
    
    }else{
      //doBeforeStuff(loadAndMerge);  //shortcut the message handler - not what I had designed but whatever
      doBeforeStuff(loadAndOverwrite);
    }

    if(isPopupVisible()) {
      chrome.runtime.sendMessage({command: "status", message: "Login success!  Your bookmarks are now syncing."});  //errors if status is not visible
      //chrome.runtime.sendMessage({command: "changeHref", href:"main.html"});  //change main page without closing it  //only good for debugging.  IRL users shouldn't have to worry about this page
      chrome.runtime.sendMessage({command: "close"}); 
    }

  }else if(response[0] == "invalid"){
    chrome.runtime.sendMessage({command: "status", message: "Incorrect email or password."});  //errors if status is not visible


  }else{
    chrome.runtime.sendMessage({command: "status", message: response[0]});  //pump message verbatim to status
    chrome.browserAction.setTitle({title:response[0]});
  }
}


function isFirstLogin(){
  chrome.storage.sync.get(['firstLogin'], function(firstLogin) {  //sometimes this returns an object, sometimes a string?
   if(!firstLogin || firstLogin.firstLogin == "true"){
     return true;  //first time (or error)
   }
   return false;
  });
}

function isOpInProgress(){
  chrome.storage.sync.get(['isOperationInProgress'], function(isOperationInProgress) {  //sometimes this returns an object, sometimes a string?
   if(!isOperationInProgress || isOperationInProgress.isOperationInProgress == "false"){
     return false; 
   }
   return true;
  });
}

function createAccount(e, p){
  //showRegisterScreen();
  _email = e;
  _password = p;
 console.log("Creating an account");

  var outstring = "&command=createAccount";
  sendtophp(outstring);

}
function createAccountCont(response){
 console.log("Creating an account continued"); 
  // if(response[0] == "newAccountSuccess"){  //depreciated
  //     //???
  if(response[0] == "validatingEmail"){
    if(isPopupVisible()) {
        chrome.runtime.sendMessage({command: "status", message: "An email has been sent to " + _email+".  (May take several minutes to arrive.)  Please follow the instructions in the email to validate your account."});  //will error if no windows are open.  That's ok, i guess
    }
    chrome.browserAction.setTitle({title:"Awaiting EmailValidation"});
    chrome.runtime.sendMessage({command: "close"}); 
    chrome.storage.sync.set({firstLogin:"true"});

  }else if(response[0] == "AccountExists"){
    chrome.runtime.sendMessage({command: "status", message: "An account with this email already exists."});  //pump message verbatim to status

  }else{
    chrome.runtime.sendMessage({command: "status", message: response[0]});  //pump message verbatim to status
    chrome.browserAction.setTitle({title:response[0]});
  }


}

function logout(){
  console.log("Setting icon to disabled");
  chrome.browserAction.setPopup({popup:"login.html"});
  chrome.browserAction.setIcon({path: 'icons/icon_96_off.png'});  //change icon
//  chrome.storage.sync.set({email:""}); //delete data  //don't delete, in case they want to log back in don't make them retype their whole password
  var version = chrome.runtime.getManifest().version;
  //chrome.browserAction.setTitle({title:"Daxmarks "+version+" - Click to log in."});
  chrome.browserAction.setTitle({title:"Daxmarks - Click to log in."});
  chrome.storage.sync.set({password:""});
  _email = "";
  _password = "";
  chrome.runtime.sendMessage({command: "close"}); 

}

function forgotPassword(){
  //I guess we need to show a page for them to input their email
  //chrome.browserAction.setPopup({popup:"resetPassword.html"});  //I just cannot get the screen to change :(
  chrome.runtime.sendMessage({command: "close"}); 
  //chrome.browserAction.setPopup({popup:"main.html"});
  chrome.windows.create({url:"resetPassword.html", type:"popup"});

  //then send a message to email

}

function resetPassword(){
  //then send a message to email
  //that direct them to a php page to put in a new password
  console.log("sending passowrd reset request");  
  command = "&command=resetPassword";
  sendtophp(command);
  logout();  //delete all local data
}

function showRegisterScreen(){  //link clicked clicked
  //chrome.browserAction.setPopup({popup:"register.html"});
  
  chrome.windows.create({url:"register.html", type:"popup"});
  //chrome.runtime.sendMessage({command: "close"}); 
}



function blinkIcon(blink = true){


  if(!blink){
    chrome.browserAction.setIcon({path: 'icons/icon_96_on.png'});  //reset to default
    //console.log("Killing blink!")
    clearTimeout(_timer1);  //https://stackoverflow.com/questions/452003/how-to-cancel-kill-window-settimeout-before-it-happens-on-the-client
   return;
 }

  //console.log("blink!")
  _iconOn = !_iconOn;

  if (_iconOn){
    chrome.browserAction.setIcon({path: 'icons/icon_96_green.png'});  //change icon
  }else{
    chrome.browserAction.setIcon({path: 'icons/icon_96_on.png'});  //change icon
  }

  //_timer1 = setTimeout(blinkIcon,300);   //this makes it keep blinking indefinitely until explicitly killed 


}
