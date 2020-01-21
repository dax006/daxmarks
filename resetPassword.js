//trying to override default form submit which does NOT listen for response from server

//after submit completes close window
function handleMessage(request, sender, sendResponse) {
 console.log("Message from the content script: " + request.command);
  console.log(request);
  switch (request.command){
    case "close":
      console.log("close page!");
      setTimeout(function () { window.close();}, 3000);  //https://stackoverflow.com/questions/16127115/closing-popup-window-after-3-seconds
      //window.close();
      break;
    case "status":
      
      // $('#status').text(request.message);
      document.getElementById('status').textContent = request.message;
      
      break;
  }
}

//https://stackoverflow.com/questions/18592679/xmlhttprequest-to-post-html-form
function submitForm(evt){
  console.log("change password Form submitted");
  evt.preventDefault();
  var email = document.resetPasswordForm.email.value;
  var newPassword = document.resetPasswordForm.new_password.value;
  var confirmPassword = document.resetPasswordForm.confirm_password.value;
  var status = document.getElementById('status');
  if(newPassword != confirmPassword){
    
    status.textContent = "Passwords do not match.";
    // $('#status').text("Passwords do not match.");    
    return false;  //block default click action?
  }
  
  //hash the password just so we can claim passwords are never stored anywhere, client or server, l,ocal or remote
  newPassword = CryptoJS.SHA3(newPassword);//https://stackoverflow.com/questions/5111164/are-there-any-one-way-hashing-functions-available-in-native-javascript
  newPassword = bin2String(newPassword.words);
  
  var sending = chrome.runtime.sendMessage({command: "resetPassword", email:email, newPassword:newPassword});
  

  //check if valid email.

  // $('#status').text("Sending Email to " + email);
  status.textContent = "Sending Email to " + email;
  //setTimeout(function () { window.close();}, 3000);  //https://stackoverflow.com/questions/16127115/closing-popup-window-after-3-seconds

  

  return false;  //block default click action?

}

function bin2String(array) {  //https://stackoverflow.com/questions/3195865/converting-byte-array-to-string-in-javascript
  var result = "";
  for (var i = 0; i < array.length; i++) {
    //result += String.fromCharCode(parseInt(array[i], 2));  //its not ascii
    //result += array[i].toString(16);  //convert to hex?
    result += array[i];
  }
  return result;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

document.getElementById("resetPasswordForm").addEventListener("submit", submitForm, false);  //add a new event listener
chrome.runtime.onMessage.addListener(handleMessage);
