/**
 * session.userData.settings.hours_per_day - 9
 * session.userData.settings.days_in_week - 5
 * session.userData.settings.working_days - א-ה // deprecated
 * quick reply in compeny if there is any                                                   done
 * after ending dvp ask if the user want to send another dvp
 * every working day at 17:00 if the user dont have fully hours_per_day send notification
 * every working day at 09:00, 13:00, 17:00
 * option to see what the user already entered
 * create file and send it to the user by request
 * create file and send it to the user every last woking day and every last day of month
 */
"use strict"

require('./config.js');

let restify = require('restify');
let builder = require('botbuilder');
let moment = require('moment-timezone');
let apiairecognizer = require('api-ai-recognizer');

// Setup Restify Server
let server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
let connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

let bot = new builder.UniversalBot(connector);

server.post('/api/messages', connector.listen());

let intents = new builder.IntentDialog();

bot.dialog('/', intents);

bot.dialog('personal_name', [
    function (session, arg, next) {
        builder.Prompts.text(session, "what is your first name?");
    },
    function (session, results, next) {
        session.userData.userName = results.response;
        session.send("thanks, " + session.userData.userName);
        session.replaceDialog("/");
    }
]);

bot.dialog("dvp_query", [
    function (session, args, next) {
        // init
        session.userData.dvp = session.userData.dvp || [];
        let dvp_history = build_dvp_history(session.userData.dvp);
        //
        let dates = Object.keys(dvp_history);
        if (dates.length === 0) {
            session.send("לא דווחו שעות");
        }
        else {
            dates.forEach(function (date) {
                let msg = "Date: " + date + "\n\r";
                let customers_array = Object.keys(dvp_history[date].customers);
                customers_array.forEach(function (customer) {
                    console.log(dvp_history[date].customers[customer].total_hours);
                    msg = msg + "Customer: " + customer + " " + dvp_history[date].customers[customer].total_hours + "Hours \n\r";
                    session.send(msg);
                });
            });
        }
        session.endDialog();
    }
]).triggerAction({
    matches: [/^שאילתא לדיווח שעות/i]
});

function build_dvp_history(dvp_array) {
    let dvp_history = {};

    for (let i = 0; i < dvp_array.length; i++) {
        let from_timezone = moment(dvp_array[i].from);
        let to_timezone = moment(dvp_array[i].to);

        let from_date = from_timezone.format("DD/MM/YYYY");
        let duration = moment.duration(to_timezone.diff(from_timezone));
        let duration_as_hours = duration.asHours();
        
        dvp_history[from_date] = dvp_history[from_date] || { customers : {}, total_hours: 0};
        dvp_history[from_date].total_hours = dvp_history[from_date].total_hours + duration_as_hours;
        dvp_history[from_date].customers[dvp_array[i].customer] = dvp_history[from_date].customers[dvp_array[i].customer] || { total_hours: 0, details: [] };
        dvp_history[from_date].customers[dvp_array[i].customer].total_hours = dvp_history[from_date].customers[dvp_array[i].customer].total_hours + duration_as_hours;
        dvp_history[from_date].customers[dvp_array[i].customer].details.push(dvp_array[i]);
    }
    return dvp_history
}

bot.dialog("dvp", [
    function (session, args, next) {
        session.dialogData.current_dvp = {};
        if (args.current_dvp && args.current_dvp.from) {
            session.dialogData.current_dvp.from = args.current_dvp.from;
        }
        session.userData.customers = session.userData.customers || [];
        if (session.userData.customers.length) {
            let choice = session.userData.customers.join("|");
            builder.Prompts.choice(session, "עבור מי? אם הלקוח לא מופיע, יש להקליד אותו באופן חופשי", choice, {listStyle: builder.ListStyle.button, maxRetries:0});
        } else {
            builder.Prompts.text(session, "עבור מי?");
        }
    },
    function (session, results, next) {
        session.dialogData.current_dvp.customer = session.message.text;
        if (session.dialogData.current_dvp.from) {
            results.response = {};
            results.response.resolution = {};
            results.response.resolution.start = session.dialogData.current_dvp.from;
            results.response.resolution.end = moment().format();
            next(results);
        }
        else {
            builder.Prompts.time(session, "ממתי?", {inputHint: "HH:mm", /*retryPrompt: "sss",*/ maxRetries: 1});
        }
    },
    function (session, results, next) {
        session.dialogData.current_dvp.from = results.response.resolution.start;
        // (HH:mm-HH:mm)
        if (results.response.resolution.end) {
            results.response.resolution.start = results.response.resolution.end;
            next(results);
        } else {
            builder.Prompts.time(session, "עד מתי?");
        }
    },
    function (session, results, next) {
        session.dialogData.current_dvp.to = results.response.resolution.start;
        builder.Prompts.text(session, "מה ביצעת?");
    },
    function (session, results, next) {
        session.dialogData.current_dvp.what = results.response;
        //
        session.send("תודה");
        // add customer
        session.userData.customers = add_customer(session.userData.customers, session.dialogData.current_dvp.customer);
        // add dvp
        session.userData.dvp = session.userData.dvp || [];
        session.userData.dvp.push(session.dialogData.current_dvp);
        session.endDialog();
    }
]).triggerAction({
    matches: [/^דיווח שעות/i]
});

bot.dialog("dvp_start", [
    function (session, args, next) {
        session.userData.current_dvp = {};
        session.userData.current_dvp.from = moment().format();
        session.send("Start Time: " + moment(session.userData.current_dvp.from).format("DD/MM/YYYY HH:mm"));
        session.endDialog();
    }
]).triggerAction({
    matches: [/^התחלת דיווח/i]
});

bot.dialog("dvp_end", [
    function (session, args, next) {
        session.userData.current_dvp = session.userData.current_dvp || {};
        if (!session.userData.current_dvp.from) {
                session.replaceDialog("dvp");
        } else {
            let args = { current_dvp: { from: session.userData.current_dvp.from } };
            session.userData.current_dvp = {};
            session.replaceDialog("dvp", args);
        }
        //session.endDialog();
    }
]).triggerAction({
    matches: [/^סיום דיווח/i]
});

function add_customer(customer_array, customer_name) {
    if (!customer_array.includes(customer_name)) {
        customer_array.push(customer_name);
    }
    return customer_array
}

bot.dialog("dvp_settings", [
    function (session, args, next) {
        builder.Prompts.number(session, "כמה שעות ביום בדרך כלל אתה עובד?");
    },
    function (session, results, next) {
        session.userData.settings = session.userData.settings || {};
        session.userData.settings.hours_per_day = results.response;
        builder.Prompts.number(session, "כמה ימים בשבוע בדרך כלל אתה עובד?");
    },
    function (session, results, next) {
        session.userData.settings = session.userData.settings || {};
        session.userData.settings.days_in_week = results.response;
        session.send("תודה");
        session.replaceDialog("/");
    }
]).triggerAction({
    matches: [/^הגדרות לדיווח שעות/i]
});

bot.dialog('reset', function (session) {
    session.sendTyping();
    console.log('typing... message text: ' + session.message.text);
    session.userData = {};
    session.send("reset ok");
    session.endDialog();
}).triggerAction({
    matches: [/^reset/i]
});

intents.onDefault(function (session) {
    session.sendTyping();

    let chapter = [];
    let options = [
        { "postback": "דיווח שעות", "title": "דיווח שעות" },
        { "postback": "שאילתא לדיווח שעות", "title": 'הוצאת דו"ח' },
        { "postback": "התחלת דיווח", "title": 'התחלת דיווח' },
        { "postback": "הגדרות לדיווח שעות", "title": "הגדרות" }
    ];
    if (session.userData && session.userData.current_dvp && session.userData.current_dvp.from) {
        options = [
            { "postback": "דיווח שעות", "title": "דיווח שעות" },
            { "postback": "שאילתא לדיווח שעות", "title": 'הוצאת דו"ח' },
            { "postback": "סיום דיווח", "title": 'סיום דיווח' },
            { "postback": "הגדרות לדיווח שעות", "title": "הגדרות" }
        ];
    }
    chapter.push(getCard(session, "דיווח שעות", 'שירות לתיעוד את שעות העבודה, ', 'ליווי אישי בתעוד שעות העבודה', "", options));
    let msg = new builder.Message(session).attachmentLayout(builder.AttachmentLayout.carousel).attachments(chapter);
    session.send(msg);
    session.endDialog();
});

function getCard(session, title, subtitle, text, imageUrl, buttons) {
    // buttons = [{postback: postback text, title: title}]
    let buttons_array = [];
    if (buttons) {
        for (let i = 0; i<buttons.length; i++) {
            let button = new builder.CardAction.postBack(session, buttons[i].postback, buttons[i].title );
            buttons_array.push(button);
        }
    }
    let card = new builder.HeroCard(session)
        .title(title)
        .subtitle(subtitle)
        .text(text)
        .buttons(buttons_array);

    if (imageUrl) {
        card.images([
            builder.CardImage.create(session, imageUrl)
        ]);
    }

    return card;
}

function translate_promise(lang, sentence) {
    var options = {
        method: 'GET',
        url: 'https://translate.yandex.net/api/v1.5/tr.json/translate?key=' + process.env.YANDEX + '&lang=' + lang + '&text=' + sentence,
        body: '{}'
    };

    let translate = new Promise((resolve, reject) => {
        request(options, function (error, response, body) {
            if (error) reject(error);
            body = JSON.parse(body)
            if (body.code!==200) {
                reject(error);
            }
            resolve(body);
        });
    });
    return translate
}
///////

let recognizer = new apiairecognizer(process.env.APIAI_CLIENT_ACCESS_TOKEN);   // api.ai Tafnit agent
bot.recognizer(recognizer);
// Create a custom prompt
var prompt = new builder.Prompt({ defaultRetryPrompt: "I'm sorry. I didn't recognize your search." })
    .onRecognize(function (context, callback) {
        // Call prompts recognizer
        recognizer.recognize(context, function (err, result) {
            // If the intent returned isn't the 'None' intent return it
            // as the prompts response.
            if (result && result.intent !== 'None') {
                callback(null, result.score, result);
            } else {
                callback(null, 0.0);
            }
        });
    });

// Add your prompt as a dialog to your bot
bot.dialog('myLuisPrompt', prompt);

// Add function for calling your prompt from anywhere
builder.Prompts.myLuisPrompt = function (session, prompt, options) {
    var args = options || {};
    args.prompt = prompt || options.prompt;
    session.beginDialog('myLuisPrompt', args);
}
// Then call it like a builtin prompt:

bot.dialog('foo', [
    function (session) {
        builder.Prompts.myLuisPrompt(session, "Please say something I recognize");
    },
    function (session, results) {
        session.send(results.response.result.fulfillment.speech);
        session.endDialog();
    }
]).triggerAction({
    matches: [/^foo/i]
});