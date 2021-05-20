var BROKER_URL;
var PORT;
var USERNAME;
var CHANNEL;
var CONNECTED = false;
var sentMessages = 0;
var sentTooManyMsgsWarning = false;

var users = [];

// Function to extract URL parameters.
$.urlParam = function(name){
	var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
	console.log(results);
	if (results==null){
		return null;
	}
	else {
		console.log(results[1]);
		return results[1] || 0;
	}
}

// Handles sending a message to the broker.
function sendChatMessage() {
	if (CONNECTED) {

		if (sentMessages > 1) {
			sendMetaMessage("danger", "You are sending too many messages. Please wait...");
			return;
		}

		if ($("#chat-input").val().length > 0) {
			var message = new Paho.MQTT.Message($("#chat-input").val());
			message.destinationName = PUBLISH_TOPIC;
			client.send(message);
			$("#chat-input").val('');

			// Can only send one message a second.
			sentMessages++;
			setTimeout(function() {
				sentMessages = 0;
			}, 1500);
		}

	} else {
		sendMetaMessage("danger", "Cannot send message, not connected.");
	}
}

// Set up reply button.
$("#reply-button").click(sendChatMessage);
window.onkeydown = function (event) {
	var code = event.keyCode ? event.keyCode : event.which;
	if (code === 13) { // 13 == enter key
		if ($('#chat-input').is(':focus')) {
			event.preventDefault();
			sendChatMessage();
		}
	}
};

// Set up connect button.
function setupConnectButton() {

	if (!CONNECTED) {

		$("#connect-button").unbind();
		$("#connect-button").removeClass("btn-warning");
		$("#connect-button").addClass("btn-info");
		$("#connect-button").html('Connect');

		$("#mqtt-broker").removeAttr("disabled");
		$("#mqtt-port").removeAttr("disabled");
		$("#username-input").removeAttr("disabled");

		$("#connect-button").click(function() {
			USERNAME = $("#username-input").val();
			if (USERNAME == null || USERNAME == '') {
				USERNAME = 'Anonymous';
				$("#username-input").val('Anonymous');
			}

			var validated = true;
			BROKER_URL = $("#mqtt-broker").val();
			if (BROKER_URL == null || BROKER_URL == '') {
				sendMetaMessage("danger", "No broker specified.");
				validated = false;
			}
			PORT = $("#mqtt-port").val();
			if (PORT == null || isNaN(PORT) || PORT == '') {
				sendMetaMessage("danger", "No port specified, or port is invalid.");
				validated = false;
			}

			if (validated) {
				doConnect();
			}
		});

	} else {
		$("#connect-button").unbind();
		$("#connect-button").removeClass("btn-info");
		$("#connect-button").addClass("btn-warning");
		$("#connect-button").html('Disconnect');

		$("#mqtt-broker").attr("disabled", "disabled");
		$("#mqtt-port").attr("disabled", "disabled");
		$("#username-input").attr("disabled", "disabled");

		$("#connect-button").click(doDisconnect);
	}
}
// see if the user has scrolled to the bottom of the chat pane,
// if not, it will not auto scroll.
function scrolledDown() {
	var element = $("#mqtt-chat");
	return (element[0].scrollHeight - element.scrollTop()) % element.outerHeight() < 20;
}

// Just ensuring some JS content for HTML
function sanitize(string) {
	var entityMap = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': '&quot;',
		"'": '&#39;',
		"/": '&#x2F;'
	};
	return String(string).replace(/[&<>"'\/]/g, function (c) {
		return entityMap[c];
	});
}

function updateUserListUI (){
	$("#mqtt-users").empty();
	users.sort();
	users.forEach(function(user){
		if(user !== USERNAME){
			$("#mqtt-users").append(
				'<ul class="nav nav-pills nav-stacked user-menu" id="' + sanitize(user) + '">'
				 + sanitize(user) + '</ul>'
			);
		} else {
			$("#mqtt-users").append(
				'<ul class="nav nav-pills nav-stacked user-menu" id="' + sanitize(user) + '">'
				 + sanitize(user) + '<span class="text-success"> (You) </span></ul>'
			);
		}
		
	});
}
// Adds a user to the users list
function addUser(user) {
	users.push(user);
	updateUserListUI();
}
function removeFromUserList(user) {
	var index = users.indexOf(user);
	if (index !== -1) {
		users.splice(index, 1);
	}
}
function removeUser(user) {
	removeFromUserList(user);
	updateUserListUI();
}

// Handles an incoming MQTT chat message.
function handleChatMessage(message) {
	var topicResArr = message.destinationName.split("/");
	var topic = topicResArr[4];
	var msg = message.payloadString;
	var user;
	var dt = new Date();
	user = topicResArr[4];

	if(user === USERNAME){
		$("#mqtt-chat").append(
			'<p class="chat__message chat__receiver"><span class="chat__name">You</span>'
			+ sanitize(msg) + '<span class="chat__timestamp">' + sanitize(dt.toLocaleString()) + '</span>' + '</p>'
		);
	} else {
		$("#mqtt-chat").append(
			'<p class="chat__message"><span class="chat__name">' + sanitize(user) + '</span>'
			+ sanitize(msg) + '<span class="chat__timestamp">' + sanitize(dt.toLocaleString()) + '</span>' + '</p>'
		);
	}
	

	if (scrolledDown("#mqtt-chat")) {
		$("#mqtt-chat").animate({ scrollTop: $('#mqtt-chat')[0].scrollHeight}, 1000);
	}

}

function handleUserMessage(message) {
	var topicResArr = message.destinationName.split("/");
	var user = topicResArr[4];
	var announceMsg;
	if (message.payloadBytes.length == 0) {
		announceMsg = '<p class="text-center">User <strong class="text-danger">' + sanitize(user) + '</strong> has left the channel.</p>';
		removeUser(user);
	} else {
		if(user !== USERNAME){
			announceMsg = '<p class="text-center">User <strong class="text-success">' + sanitize(user) + '</strong> has joined the channel.</p>';
		} else {
			announceMsg = '<p class="text-center"><strong class="text-success">You</strong> have joined the channel.</p>';
		}
		addUser(user)
	}
	sendMetaMessage("info", announceMsg);
}

// For error, warning, success messages
function sendMetaMessage (context, msg) {
	var glyphicon;
	switch (context) {
		case "danger" : glyphicon = "glyphicon-remove-sign"; break;
		case "warning" : glyphicon = "glyphicon-warning-sign"; break;
		case "success" : glyphicon = "glyphicon-ok"; break;
		case "info" : glyphicon = "none"; break;
	}

	if (glyphicon != "none") {
		$("#mqtt-chat").append(
			'<div id="alert" class="alert alert-' + context +'">'
			+ '<span class="glyphicon ' + glyphicon + '"></span>'
			+ '&nbsp&nbsp' + msg + '</span>'
		);
		setTimeout(function () {
			$('#alert').alert('close');
		}, 3000);

	} else {
		$("#mqtt-chat").append(
			'<span id="textRemove" class="text-' + context + '">'
			+ '&nbsp&nbsp' + msg + '</span>'
		);
		setTimeout(function () {
			$('#textRemove').remove();
		}, 3000);
	}
	if (scrolledDown("#mqtt-chat")) {
		$("#mqtt-chat").animate({ scrollTop: $('#mqtt-chat')[0].scrollHeight}, 1000);
	}
}


$(document).ready(function() {

	setupConnectButton();
	BROKER_URL = $.urlParam("broker");
	if (BROKER_URL != null) {
		$("#mqtt-broker").val(BROKER_URL);
	}
	PORT = $.urlParam("port");
	if (PORT != null) {
		$("#mqtt-port").val(PORT);
	}
	USERNAME = $.urlParam("username");
	if (USERNAME != null) {
		$("#username-input").val(USERNAME);
	} else {
		USERNAME = "Anonymous"
	}
	// we can create multiple groups in future
	CHANNEL = "Channel"; 
	if (CHANNEL != null) {
		$("#channel-input").val(CHANNEL);
	}
	
});
