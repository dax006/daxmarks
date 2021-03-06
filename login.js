//trying to override default form submit which does NOT listen for response from server

//after submit completes close window
function handleMessage(request, sender, sendResponse) {
 //console.log("Message from the content script: " + request.command);
  //console.log(request);
  switch (request.command){
    case "close":
      console.log("close page!");
      setTimeout(function () { window.close();}, 3000);  //https://stackoverflow.com/questions/16127115/closing-popup-window-after-3-seconds
      //window.close();
      break;
    case "status":
      document.getElementById('status').textContent = request.message;
      break;
    case "changeHref":
      window.location.href=request.href;
  }
}

//https://stackoverflow.com/questions/18592679/xmlhttprequest-to-post-html-form
function submitForm(evt){
  evt.preventDefault();  //don't call the stuff in the 'action', I need to encrypt it
  console.log("Form submitted");
  var email = document.loginForm.email.value;
  var password = document.loginForm.password.value;
  //hash the password just so we can claim passwords are never stored anywhere, client or server, local or remote
  password = CryptoJS.SHA3(password);//https://stackoverflow.com/questions/5111164/are-there-any-one-way-hashing-functions-available-in-native-javascript
  password = bin2String(password.words);
  //console.log(password);
  var sending = chrome.runtime.sendMessage({command: "login",email:email, password:password  });

  return false;  //block default click action?

}


function bin2String(array) {  //https://stackoverflow.com/questions/3195865/converting-byte-array-to-string-in-javascript
  var result = "";
  for (var i = 0; i < array.length; i++) {
    result += array[i];
  }
  return result;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

document.getElementById("loginForm").addEventListener("submit", submitForm, false);  //add a new event listener
chrome.runtime.onMessage.addListener(handleMessage);

//set handler for password link
var forgotPasswordLink = document.getElementById("forgotPassword");
forgotPasswordLink.addEventListener("click", function() {
    
    //console.log("logout clicked");
    var sending = chrome.runtime.sendMessage({command: "forgotPassword"  });

}, false);

//set handler for register link
var registerLink = document.getElementById("registerButton");
registerLink.addEventListener("click", function() {
    
    var sending = chrome.runtime.sendMessage({command: "register"  });

}, false);

//fill in loginform with cached values
chrome.storage.sync.get(['email'], function(email) {  //sometimes this returns an object, sometimes a string?
  if(!email || email.email == "undefined") return; 
  chrome.storage.sync.get(['password'], function(password) {
    console.log("setting loginEmailto "+email.email)
    document.getElementById("loginEmail").value = email.email;
    document.getElementById("loginPass").value = password.password;
  });
});