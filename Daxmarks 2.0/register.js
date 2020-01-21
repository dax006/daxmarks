window.addEventListener("load", function() {


  console.log("register.html loaded");

  //after submit completes close window
  function handleMessage(request, sender, sendResponse) {
   console.log("Message from the background script: " + request.command);
    console.log(request);
    switch (request.command){
      case "close":
        console.log("close page!");
        setTimeout(function () { window.close();}, 10000);  //https://stackoverflow.com/questions/16127115/closing-popup-window-after-3-seconds
        //window.close();
        break;
      case "status":
        //document.getElementById('status').textContent = request.message;
        document.getElementById('status').innerHTML += (request.message + "<br>");  //allow html markup in messages.
        break;
      // case "changeHref":
      //   window.location.href=request.href;
    }
    
  }

  //https://stackoverflow.com/questions/18592679/xmlhttprequest-to-post-html-form
  function submitForm(evt){
    evt.preventDefault();  //else it refreshes page immediately
    console.log("Form submitted");

    var Rform = document.registerForm;   //was getting all sorts of 'cannot find value' errors until I split it all up
    var eField = Rform.email;
    //console.log("Emailfield" + eField.value);
    var email = eField.value;
    var pField = Rform.password;
    var p = pField.value;

    p = CryptoJS.SHA3(p);//https://stackoverflow.com/questions/5111164/are-there-any-one-way-hashing-functions-available-in-native-javascript
    p = bin2String(p.words);
    chrome.runtime.sendMessage({command:"registerSubmit",email:email, password:p},registerCallback);  //send a global message - wqhy isn't this sending???
    
    return false;  //block default click action?

  }

  function registerCallback(message){
    document.getElementById('status').innerHTML += message;
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

});