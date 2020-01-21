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
  evt.preventDefault();
  console.log("Form submitted");

  var Rform = document.registerForm;   //was getting all sorts of 'cannot find value' errors until I split it all up
  var eField = Rform.email;
  //console.log("Emailfield" + eField.value);
  var email = eField.value;
  var pField = Rform.password;
  var p = pField.value;

  p = CryptoJS.SHA3(p);//https://stackoverflow.com/questions/5111164/are-there-any-one-way-hashing-functions-available-in-native-javascript
  p = bin2String(p.words);
  var sending = chrome.runtime.sendMessage({command:"registerSubmit",email:email, password:p});  //send a global message

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

document.getElementById("registerForm").addEventListener("submit", submitForm, false);  //add a new event listener
chrome.runtime.onMessage.addListener(handleMessage);
