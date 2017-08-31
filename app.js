/**
 * session.userData.settings.hours_per_day - 9
 * session.userData.settings.days_in_week - 5
 * session.userData.settings.working_days - א-ה // deprecated
 * after ending dvp ask if the user want to send another dvp
 * every working day at 17:00 if the user dont have fully hours_per_day send notification
 * every working day at 09:00, 13:00, 17:00
 * option to see what the user already entered
 * create file and send it to the user by request
 * create file and send it to the user every last woking day and every last day of month
 */
"use strict"

//require('./config.js');

let restify = require('restify');
let builder = require('botbuilder');
let moment = require('moment-timezone');
let apiairecognizer = require('api-ai-recognizer');
let resources = {};
resources.string = require("./res/string/he.json");

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
        builder.Prompts.text(session, resources.string.first_name);
    },
    function (session, results, next) {
        session.userData.userName = results.response;
        session.send(resources.string.thanks + ", " + session.userData.userName);
        session.replaceDialog("/");
    }
]);

bot.dialog("dvp_file", [
    function (session, args, next) {
        session.dialogData.dvp_query_detailed = {};
        builder.Prompts.time(session, "לאיזה תאריך/תאריכים תרצה את הקובץ?", {/*retryPrompt: "sss",*/ maxRetries: 1});
    },
    function (session, results, next) {
        session.dialogData.dvp_query_detailed.from = results.response.resolution.start;
        if (results.response.resolution.end) {
            session.dialogData.dvp_query_detailed.to = results.response.resolution.end;
        }
        session.send("I'm working on your dvp file for: " + moment(session.dialogData.dvp_query_detailed.from).format("DD/MM/YYYY") + "-" + moment(session.dialogData.dvp_query_detailed.to).format("DD/MM/YYYY"))
        session.endDialog();
    }
]).triggerAction({
    matches: [/^שליחת קובץ דיווח שעות/i]
});

bot.dialog("dvp_query_detailed", [
    function (session, args, next) {
        session.dialogData.dvp_query_detailed = {};
        builder.Prompts.time(session, "לאיזה תאריך/תאריכים תרצה פירוט?", {/*retryPrompt: "sss",*/ maxRetries: 1});
    },
    function (session, results, next) {
        session.dialogData.dvp_query_detailed.from = results.response.resolution.start;
        if (results.response.resolution.end) {
            session.dialogData.dvp_query_detailed.to = results.response.resolution.end;
        }
        session.send("I'm working on your dvp for: " + moment(session.dialogData.dvp_query_detailed.from).format("DD/MM/YYYY") + "-" + moment(session.dialogData.dvp_query_detailed.to).format("DD/MM/YYYY"))
        session.endDialog();
    }
]).triggerAction({
    matches: [/^דיווח שעות מפורט/i]
});

bot.dialog("dvp_query", [
    function (session, args, next) {
        // init
        session.userData.dvp = session.userData.dvp || [];
        let dvp_history = build_dvp_history(session.userData.dvp);
        //
        let dates = Object.keys(dvp_history);
        if (dates.length === 0) {
            session.send(resources.string.no_dvp);
        }
        else {
            session.send("החודש (08/2017): עבדת סה'כ 8 שעות, עבור 2 לקוחות");
            session.send("היום (31/08/2017): עבדת סה'כ 8 שעות, עבור 2 לקוחות");
            builder.Prompts.choice(session, "איך תרצה להמשיך?", "דיווח שעות מפורט|שליחת קובץ דיווח שעות", {listStyle: builder.ListStyle.button, maxRetries:0});
            session.endDialog();

            /*dates.forEach(function (date) {
                let msg = "Date: " + date + "\n\r";
                let customers_array = Object.keys(dvp_history[date].customers);
                customers_array.forEach(function (customer) {
                    console.log(dvp_history[date].customers[customer].total_hours);
                    msg = msg + resources.string.customer + ": " + customer + " " + Number(dvp_history[date].customers[customer].total_hours).toFixed(2) + " " + resources.string.hours +"\n\r";
                    session.send(msg);
                });
            });*/
        }
        //session.endDialog();
    },
    function (session, results, next) {
        session.dialogData.answer = session.message.text;
        if (session.dialogData.answer==="לדיווח שעות מפורט") {
            session.replaceDialog("dvp_query_detailed");
        } else if (session.dialogData.answer==="לשליחת קובץ דיווח שעות") {
            session.replaceDialog('/');
        }
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
            builder.Prompts.choice(session, resources.string.for_who_dvp + " " + resources.string.for_who_dvp_help, choice, {listStyle: builder.ListStyle.button, maxRetries:0});
        } else {
            builder.Prompts.text(session, resources.string.for_who_dvp);
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
            builder.Prompts.time(session, resources.string.from_dvp, {inputHint: "HH:mm", /*retryPrompt: "sss",*/ maxRetries: 1});
        }
    },
    function (session, results, next) {
        session.dialogData.current_dvp.from = results.response.resolution.start;
        // (HH:mm-HH:mm)
        if (results.response.resolution.end) {
            results.response.resolution.start = results.response.resolution.end;
            next(results);
        } else {
            builder.Prompts.time(session, resources.string.to_dvp);
        }
    },
    function (session, results, next) {
        session.dialogData.current_dvp.to = results.response.resolution.start;
        builder.Prompts.text(session, resources.string.what_dvp);
    },
    function (session, results, next) {
        session.dialogData.current_dvp.what = results.response;
        //
        session.send(resources.string.thanks);
        ///
        let from_timezone = moment(session.dialogData.current_dvp.from);
        let to_timezone = moment(session.dialogData.current_dvp.to);
        let duration = moment.duration(to_timezone.diff(from_timezone));
        let duration_as_hours = duration.asHours();
        ///
        session.send("ביצעת " + session.dialogData.current_dvp.what + " ללקוח " + session.dialogData.current_dvp.customer + " במשך " + duration_as_hours + " שעות ");
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
        builder.Prompts.number(session, resources.string.hours_per_day);
    },
    function (session, results, next) {
        session.userData.settings = session.userData.settings || {};
        session.userData.settings.hours_per_day = results.response;
        builder.Prompts.number(session, resources.string.days_in_week);
    },
    function (session, results, next) {
        session.userData.settings = session.userData.settings || {};
        session.userData.settings.days_in_week = results.response;
        session.send(resources.string.thanks);
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
    chapter.push(getCard(session, resources.string.dvp, resources.string.dvp_title, resources.string.dvp_subtitle, "", options));
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