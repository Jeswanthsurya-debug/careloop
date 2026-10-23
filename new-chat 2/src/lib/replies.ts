import type { LangCode } from "./languages";
import { resolveLang } from "./languages";

/** How well something is going, used to pick the right phrasing. */
export type Tone = "great" | "good" | "low";

export type ReplyStrings = {
  logged_taken: (tone: Tone) => string;
  logged_missed: string;
  care_plan: (remaining: string[], allDone: boolean) => string;
  checkin_meals: (skipped: boolean) => string;
  checkin_mood: (tone: Tone) => string;
  wellness: (mood: Tone, meds: Tone) => string;
  anomalies_none: string;
  anomalies_found: (detail: string) => string;
  hydration: (countWord: string, reachedGoal: boolean) => string;
  appointment: (title: string, when: string) => string;
  alerted: string;
  greeting: string;
  smalltalk: string;
  trouble: string;
  /** Joining word for lists ("and", "y", "et"...). */
  and: string;
};

const listWith = (items: string[], join: string) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ${join} ${items[items.length - 1]}`;

const english: ReplyStrings = {
  and: "and",
  logged_taken: (tone) =>
    tone === "low"
      ? "Thank you, I have written that down. We will take the next one together."
      : tone === "great"
        ? "Thank you, I have written that down. You are doing really well with your medicines."
        : "Thank you, I have written that down. You are keeping up nicely this week.",
  logged_missed:
    "No problem at all, I have noted that it was missed. Shall I remind you a little later, or tell your family?",
  care_plan: (remaining, allDone) =>
    allDone
      ? "You have taken everything on your list today. Nothing else is due."
      : `Today you still have ${listWith(remaining, "and")}. Shall I remind you when it is time?`,
  checkin_meals: (skipped) =>
    skipped
      ? "Thank you for telling me, I have noted it. Could you manage a small snack for me?"
      : "Lovely, I have noted that down. Eating well makes a real difference.",
  checkin_mood: (tone) =>
    tone === "low"
      ? "I am really glad you told me. I am here with you — shall I let your family know, or would you like to talk a little?"
      : tone === "great"
        ? "That is lovely to hear. I have saved it with your week."
        : "Thank you for telling me. I have noted how you are feeling today.",
  wellness: (mood, meds) =>
    `Your week looks steady. ${
      mood === "low" ? "Your mood has been a little low" : mood === "great" ? "Your mood has been bright" : "Your mood has been good"
    } and ${
      meds === "low" ? "a few doses were missed" : meds === "great" ? "you have taken your medicines well" : "you have mostly kept up with your medicines"
    }.`,
  anomalies_none: "Nothing looks out of the ordinary. Your routine has been steady this week.",
  anomalies_found: (detail) => `One small thing: ${detail}. Nothing to worry about, but worth keeping an eye on.`,
  hydration: (countWord, reachedGoal) =>
    reachedGoal
      ? "Lovely, you have had plenty of water today. That is your full day done."
      : `Noted, that is ${countWord} today. A little more water would be lovely.`,
  appointment: (title, when) => `I have put ${title} in your diary for ${when}. I will remind you nearer the time.`,
  alerted: "Done, I have let your family know. Someone will check in with you soon.",
  greeting: "Hello, it is lovely to hear you. How are you feeling today?",
  smalltalk: "I am listening. Tell me about your medicine or your day, or ask me to call your family.",
  trouble: "Sorry, something slipped on my side. I am still here — could you say that once more?",
};

const hindi: ReplyStrings = {
  and: "और",
  logged_taken: (tone) =>
    tone === "low"
      ? "धन्यवाद, मैंने लिख लिया। अगली खुराक हम साथ में लेंगे।"
      : tone === "great"
        ? "धन्यवाद, मैंने लिख लिया। आप दवाएँ बहुत अच्छे से ले रही हैं।"
        : "धन्यवाद, मैंने लिख लिया। इस सप्ताह आप अच्छा कर रही हैं।",
  logged_missed: "कोई बात नहीं, मैंने नोट कर लिया कि खुराक छूट गई। थोड़ी देर बाद याद दिलाऊँ या परिवार को बताऊँ?",
  care_plan: (remaining, allDone) =>
    allDone
      ? "आज की सारी दवाएँ आप ले चुकी हैं। और कुछ बाकी नहीं है।"
      : `आज अभी ${listWith(remaining, "और")} बाकी है। समय होने पर याद दिला दूँ?`,
  checkin_meals: (skipped) =>
    skipped
      ? "बताने के लिए धन्यवाद, मैंने नोट कर लिया। थोड़ा कुछ खा लीजिए?"
      : "बहुत अच्छा, मैंने नोट कर लिया। अच्छा खाना बहुत फ़र्क़ डालता है।",
  checkin_mood: (tone) =>
    tone === "low"
      ? "अच्छा हुआ आपने मुझे बताया। मैं आपके साथ हूँ, परिवार को बताऊँ या थोड़ी बात करें?"
      : tone === "great"
        ? "सुनकर बहुत अच्छा लगा। मैंने इसे आपके सप्ताह में रख लिया।"
        : "बताने के लिए धन्यवाद। मैंने आज का हाल लिख लिया।",
  wellness: (mood, meds) =>
    `आपका सप्ताह शांत रहा। ${
      mood === "low" ? "मन थोड़ा उदास रहा" : mood === "great" ? "मन बहुत अच्छा रहा" : "मन अच्छा रहा"
    } और ${
      meds === "low" ? "कुछ खुराकें छूट गईं" : meds === "great" ? "आपने दवाएँ अच्छे से लीं" : "आपने लगभग सभी दवाएँ लीं"
    }।`,
  anomalies_none: "कुछ भी असामान्य नहीं दिखता। इस सप्ताह आपकी दिनचर्या ठीक रही।",
  anomalies_found: (detail) => `एक छोटी बात: ${detail}। चिंता की बात नहीं, पर ध्यान रखना अच्छा होगा।`,
  hydration: (countWord, reachedGoal) =>
    reachedGoal
      ? "बहुत अच्छा, आज आपने भरपूर पानी पिया। आज का लक्ष्य पूरा हो गया।"
      : `नोट कर लिया, आज ${countWord} हुए। थोड़ा और पानी पी लीजिए।`,
  appointment: (title, when) => `मैंने ${title} को ${when} के लिए डायरी में रख दिया है। समय पर याद दिला दूँगी।`,
  alerted: "हो गया, मैंने आपके परिवार को बता दिया। कोई जल्दी ही आपसे बात करेगा।",
  greeting: "नमस्ते, आपकी आवाज़ सुनकर अच्छा लगा। आज आप कैसा महसूस कर रही हैं?",
  smalltalk: "मैं सुन रही हूँ। अपनी दवा या अपने दिन के बारे में बताइए, या परिवार को बुलाने को कहिए।",
  trouble: "माफ़ कीजिए, मेरी तरफ़ कुछ गड़बड़ हुई। मैं यहीं हूँ, एक बार फिर कहिए?",
};

const tamil: ReplyStrings = {
  and: "மற்றும்",
  logged_taken: (tone) =>
    tone === "low"
      ? "நன்றி, குறித்துக்கொண்டேன். அடுத்த மாத்திரையை சேர்ந்து எடுப்போம்."
      : tone === "great"
        ? "நன்றி, குறித்துக்கொண்டேன். மருந்துகளை நீங்கள் மிக நன்றாக எடுக்கிறீர்கள்."
        : "நன்றி, குறித்துக்கொண்டேன். இந்த வாரம் நீங்கள் நன்றாக செய்கிறீர்கள்.",
  logged_missed: "பரவாயில்லை, மாத்திரை தவறியது குறித்துக்கொண்டேன். பிறகு நினைவூட்டவா அல்லது குடும்பத்தில் சொல்லவா?",
  care_plan: (remaining, allDone) =>
    allDone
      ? "இன்றைய மருந்துகள் அனைத்தும் எடுத்துவிட்டீர்கள். வேறு எதுவும் பாக்கி இல்லை."
      : `இன்று இன்னும் ${listWith(remaining, "மற்றும்")} உள்ளது. நேரம் வரும்போது நினைவூட்டவா?`,
  checkin_meals: (skipped) =>
    skipped
      ? "சொன்னதற்கு நன்றி, குறித்துக்கொண்டேன். கொஞ்சம் சிற்றுண்டி சாப்பிடுகிறீர்களா?"
      : "நல்லது, குறித்துக்கொண்டேன். நன்றாக சாப்பிடுவது மிகவும் உதவும்.",
  checkin_mood: (tone) =>
    tone === "low"
      ? "நீங்கள் சொன்னது மிக நல்லது. நான் உங்களுடன் இருக்கிறேன் — குடும்பத்தில் சொல்லவா, அல்லது கொஞ்சம் பேசலாமா?"
      : tone === "great"
        ? "கேட்க மகிழ்ச்சியாக இருக்கிறது. உங்கள் வாரத்தில் சேர்த்துவிட்டேன்."
        : "சொன்னதற்கு நன்றி. இன்று நீங்கள் எப்படி உணர்கிறீர்கள் என்பதைக் குறித்தேன்.",
  wellness: (mood, meds) =>
    `உங்கள் வாரம் அமைதியாக இருந்தது. ${
      mood === "low" ? "மனநிலை சற்று சோர்வாக இருந்தது" : mood === "great" ? "மனநிலை மிக நன்றாக இருந்தது" : "மனநிலை நன்றாக இருந்தது"
    } ${
      meds === "low" ? "மேலும் சில மாத்திரைகள் தவறின" : meds === "great" ? "மேலும் மருந்துகளை நன்றாக எடுத்தீர்கள்" : "மேலும் கிட்டத்தட்ட அனைத்து மருந்துகளையும் எடுத்தீர்கள்"
    }.`,
  anomalies_none: "அசாதாரணமாக எதுவும் தெரியவில்லை. இந்த வாரம் உங்கள் வழக்கம் சீராக இருந்தது.",
  anomalies_found: (detail) => `ஒரு சிறிய விஷயம்: ${detail}. கவலைப்பட ஒன்றுமில்லை, ஆனால் கவனித்துக்கொள்வது நல்லது.`,
  hydration: (countWord, reachedGoal) =>
    reachedGoal
      ? "நல்லது, இன்று போதுமான தண்ணீர் குடித்துவிட்டீர்கள். இன்றைய இலக்கு நிறைவு."
      : `குறித்துக்கொண்டேன், இன்று ${countWord} ஆனது. இன்னும் கொஞ்சம் தண்ணீர் குடியுங்கள்.`,
  appointment: (title, when) => `${title} ஐ ${when} அன்று உங்கள் நாட்குறிப்பில் சேர்த்துவிட்டேன். நேரத்தில் நினைவூட்டுகிறேன்.`,
  alerted: "முடிந்தது, உங்கள் குடும்பத்தில் தெரிவித்துவிட்டேன். விரைவில் யாராவது தொடர்பு கொள்வார்கள்.",
  greeting: "வணக்கம், உங்கள் குரலைக் கேட்பது மகிழ்ச்சி. இன்று எப்படி உணர்கிறீர்கள்?",
  smalltalk: "நான் கேட்கிறேன். உங்கள் மருந்து அல்லது இன்றைய நாள் பற்றி சொல்லுங்கள், அல்லது குடும்பத்தை அழைக்கச் சொல்லுங்கள்.",
  trouble: "மன்னிக்கவும், என் பக்கம் ஏதோ தவறு. நான் இங்கேதான் இருக்கிறேன் — மீண்டும் ஒருமுறை சொல்கிறீர்களா?",
};

const telugu: ReplyStrings = {
  and: "మరియు",
  logged_taken: (tone) =>
    tone === "low"
      ? "ధన్యవాదాలు, నమోదు చేశాను. తదుపరి మాత్రను కలిసి తీసుకుందాం."
      : tone === "great"
        ? "ధన్యవాదాలు, నమోదు చేశాను. మీరు మందులను చాలా బాగా తీసుకుంటున్నారు."
        : "ధన్యవాదాలు, నమోదు చేశాను. ఈ వారం మీరు బాగా చేస్తున్నారు.",
  logged_missed: "ఫర్వాలేదు, మాత్ర మిస్ అయినట్టు నమోదు చేశాను. కొంచెం తర్వాత గుర్తు చేయనా, లేక కుటుంబానికి చెప్పనా?",
  care_plan: (remaining, allDone) =>
    allDone
      ? "ఈ రోజు మందులన్నీ తీసుకున్నారు. ఇంకేమీ మిగల్లేదు."
      : `ఈ రోజు ఇంకా ${listWith(remaining, "మరియు")} ఉన్నాయి. సమయం వచ్చినప్పుడు గుర్తు చేయనా?`,
  checkin_meals: (skipped) =>
    skipped
      ? "చెప్పినందుకు ధన్యవాదాలు, నమోదు చేశాను. కొంచెం అల్పాహారం తీసుకుంటారా?"
      : "చాలా బాగుంది, నమోదు చేశాను. బాగా తినడం నిజంగా సహాయపడుతుంది.",
  checkin_mood: (tone) =>
    tone === "low"
      ? "మీరు చెప్పడం చాలా సంతోషం. నేను మీతోనే ఉన్నాను — కుటుంబానికి తెలియజేయనా, లేక కొంచెం మాట్లాడుకుందామా?"
      : tone === "great"
        ? "వినడానికి చాలా బాగుంది. మీ వారంలో నమోదు చేశాను."
        : "చెప్పినందుకు ధన్యవాదాలు. ఈ రోజు మీరు ఎలా ఉన్నారో నమోదు చేశాను.",
  wellness: (mood, meds) =>
    `మీ వారం ప్రశాంతంగా ఉంది. ${
      mood === "low" ? "మనసు కొంచెం నిరుత్సాహంగా ఉంది" : mood === "great" ? "మనసు చాలా బాగుంది" : "మనసు బాగుంది"
    } మరియు ${
      meds === "low" ? "కొన్ని మాత్రలు మిస్ అయ్యాయి" : meds === "great" ? "మీరు మందులను బాగా తీసుకున్నారు" : "మీరు దాదాపు అన్ని మందులు తీసుకున్నారు"
    }.`,
  anomalies_none: "అసాధారణంగా ఏమీ కనిపించలేదు. ఈ వారం మీ దినచర్య నిలకడగా ఉంది.",
  anomalies_found: (detail) => `ఒక చిన్న విషయం: ${detail}. ఆందోళన అవసరం లేదు, కానీ గమనించడం మంచిది.`,
  hydration: (countWord, reachedGoal) =>
    reachedGoal
      ? "చాలా బాగుంది, ఈ రోజు తగినంత నీరు తాగారు. ఈ రోజు లక్ష్యం పూర్తయింది."
      : `నమోదు చేశాను, ఈ రోజు ${countWord} అయ్యాయి. ఇంకొంచెం నీరు తాగండి.`,
  appointment: (title, when) => `${title} ను ${when} కోసం మీ డైరీలో చేర్చాను. సమయానికి గుర్తు చేస్తాను.`,
  alerted: "అయిపోయింది, మీ కుటుంబానికి తెలియజేశాను. త్వరలో ఎవరైనా సంప్రదిస్తారు.",
  greeting: "నమస్కారం, మీ స్వరం వినడం సంతోషం. ఈ రోజు ఎలా అనిపిస్తోంది?",
  smalltalk: "నేను వింటున్నాను. మీ మందు గురించి లేదా మీ రోజు గురించి చెప్పండి, లేదా కుటుంబాన్ని పిలవమని చెప్పండి.",
  trouble: "క్షమించండి, నా వైపు ఏదో పొరపాటు. నేను ఇక్కడే ఉన్నాను — ఇంకొకసారి చెబుతారా?",
};

const spanish: ReplyStrings = {
  and: "y",
  logged_taken: (tone) =>
    tone === "low"
      ? "Gracias, ya lo anoté. Tomaremos la siguiente juntas."
      : tone === "great"
        ? "Gracias, ya lo anoté. Vas muy bien con tus medicinas."
        : "Gracias, ya lo anoté. Esta semana vas bien.",
  logged_missed: "No pasa nada, anoté que faltó. ¿Te lo recuerdo más tarde o aviso a tu familia?",
  care_plan: (remaining, allDone) =>
    allDone
      ? "Ya tomaste todo lo de hoy. No queda nada pendiente."
      : `Hoy todavía te falta ${listWith(remaining, "y")}. ¿Te aviso cuando sea la hora?`,
  checkin_meals: (skipped) =>
    skipped
      ? "Gracias por contármelo, lo anoté. ¿Podrías comer algo ligero?"
      : "Qué bien, lo he anotado. Comer bien ayuda mucho.",
  checkin_mood: (tone) =>
    tone === "low"
      ? "Me alegra mucho que me lo cuentes. Estoy aquí contigo, ¿aviso a tu familia o hablamos un rato?"
      : tone === "great"
        ? "Qué bueno escuchar eso. Lo guardé en tu semana."
        : "Gracias por contármelo. Anoté cómo te sientes hoy.",
  wellness: (mood, meds) =>
    `Tu semana se ve tranquila. ${
      mood === "low" ? "Tu ánimo ha estado algo bajo" : mood === "great" ? "Tu ánimo ha estado muy bien" : "Tu ánimo ha estado bien"
    } y ${
      meds === "low" ? "faltaron algunas dosis" : meds === "great" ? "has tomado bien tus medicinas" : "casi siempre tomaste tus medicinas"
    }.`,
  anomalies_none: "No veo nada fuera de lo normal. Tu rutina ha estado estable.",
  anomalies_found: (detail) => `Una cosita: ${detail}. Nada grave, pero conviene vigilarlo.`,
  hydration: (countWord, reachedGoal) =>
    reachedGoal
      ? "Muy bien, hoy has bebido bastante agua. Ya has cumplido el día."
      : `Anotado, llevas ${countWord} hoy. Un poco más de agua te vendría bien.`,
  appointment: (title, when) => `He apuntado ${title} para el ${when}. Te lo recordaré cuando se acerque.`,
  alerted: "Listo, ya avisé a tu familia. Alguien te buscará pronto.",
  greeting: "Hola, qué bueno escucharte. ¿Cómo te sientes hoy?",
  smalltalk: "Te escucho. Cuéntame de tu medicina o de tu día, o pídeme llamar a tu familia.",
  trouble: "Perdona, algo falló de mi lado. Sigo aquí, ¿me lo repites?",
};

const french: ReplyStrings = {
  and: "et",
  logged_taken: (tone) =>
    tone === "low"
      ? "Merci, c'est noté. Nous prendrons la prochaine ensemble."
      : tone === "great"
        ? "Merci, c'est noté. Vous suivez très bien vos médicaments."
        : "Merci, c'est noté. Vous tenez bien le rythme cette semaine.",
  logged_missed: "Ce n'est rien, j'ai noté l'oubli. Je vous le rappelle plus tard, ou je préviens votre famille ?",
  care_plan: (remaining, allDone) =>
    allDone
      ? "Vous avez tout pris aujourd'hui. Il ne reste rien."
      : `Aujourd'hui il vous reste ${listWith(remaining, "et")}. Je vous préviens le moment venu ?`,
  checkin_meals: (skipped) =>
    skipped
      ? "Merci de me le dire, c'est noté. Pourriez-vous prendre une petite collation ?"
      : "Très bien, c'est noté. Bien manger fait une vraie différence.",
  checkin_mood: (tone) =>
    tone === "low"
      ? "Je suis contente que vous me le disiez. Je suis là avec vous — je préviens votre famille, ou on parle un peu ?"
      : tone === "great"
        ? "Cela fait plaisir à entendre. Je l'ai gardé pour votre semaine."
        : "Merci de me le dire. J'ai noté comment vous vous sentez.",
  wellness: (mood, meds) =>
    `Votre semaine est calme. ${
      mood === "low" ? "Votre moral a été un peu bas" : mood === "great" ? "Votre moral a été très bon" : "Votre moral a été bon"
    } et ${
      meds === "low" ? "quelques doses ont été oubliées" : meds === "great" ? "vous avez bien pris vos médicaments" : "vous avez presque tout pris"
    }.`,
  anomalies_none: "Rien d'inhabituel. Votre routine a été régulière cette semaine.",
  anomalies_found: (detail) => `Une petite chose : ${detail}. Rien d'inquiétant, mais gardons un œil dessus.`,
  hydration: (countWord, reachedGoal) =>
    reachedGoal
      ? "Très bien, vous avez bien bu aujourd'hui. Votre journée est complète."
      : `C'est noté, cela fait ${countWord} aujourd'hui. Un peu plus d'eau ferait du bien.`,
  appointment: (title, when) => `J'ai noté ${title} dans votre agenda pour ${when}. Je vous le rappellerai.`,
  alerted: "C'est fait, votre famille est prévenue. Quelqu'un prendra de vos nouvelles bientôt.",
  greeting: "Bonjour, quel plaisir de vous entendre. Comment allez-vous aujourd'hui ?",
  smalltalk: "Je vous écoute. Parlez-moi de vos médicaments ou de votre journée, ou demandez d'appeler la famille.",
  trouble: "Désolée, quelque chose a coincé chez moi. Je suis toujours là, pouvez-vous répéter ?",
};

const german: ReplyStrings = {
  and: "und",
  logged_taken: (tone) =>
    tone === "low"
      ? "Danke, ich habe es notiert. Die nächste nehmen wir zusammen."
      : tone === "great"
        ? "Danke, ich habe es notiert. Sie nehmen Ihre Medikamente wirklich gut."
        : "Danke, ich habe es notiert. Diese Woche machen Sie das sehr gut.",
  logged_missed:
    "Das ist gar kein Problem, ich habe die ausgelassene Dosis notiert. Soll ich später erinnern oder Ihrer Familie Bescheid geben?",
  care_plan: (remaining, allDone) =>
    allDone
      ? "Sie haben heute alles genommen. Es steht nichts mehr an."
      : `Heute fehlen noch ${listWith(remaining, "und")}. Soll ich Sie rechtzeitig erinnern?`,
  checkin_meals: (skipped) =>
    skipped
      ? "Danke, dass Sie es sagen, ich habe es notiert. Schaffen Sie vielleicht eine Kleinigkeit?"
      : "Schön, das habe ich notiert. Gut zu essen macht wirklich einen Unterschied.",
  checkin_mood: (tone) =>
    tone === "low"
      ? "Ich bin froh, dass Sie es mir sagen. Ich bin bei Ihnen — soll ich Ihrer Familie Bescheid geben, oder möchten Sie reden?"
      : tone === "great"
        ? "Das höre ich sehr gern. Ich habe es zu Ihrer Woche gespeichert."
        : "Danke, dass Sie es mir sagen. Ich habe notiert, wie es Ihnen heute geht.",
  wellness: (mood, meds) =>
    `Ihre Woche sieht ruhig aus. ${
      mood === "low" ? "Ihre Stimmung war etwas gedrückt" : mood === "great" ? "Ihre Stimmung war sehr gut" : "Ihre Stimmung war gut"
    } und ${
      meds === "low" ? "einige Dosen wurden vergessen" : meds === "great" ? "Sie haben Ihre Medikamente gut genommen" : "Sie haben fast alles genommen"
    }.`,
  anomalies_none: "Es sieht nichts Ungewöhnliches aus. Ihre Woche war gleichmäßig.",
  anomalies_found: (detail) => `Eine Kleinigkeit: ${detail}. Kein Grund zur Sorge, aber behalten wir es im Blick.`,
  hydration: (countWord, reachedGoal) =>
    reachedGoal
      ? "Sehr schön, Sie haben heute genug getrunken. Ihr Tagesziel ist erreicht."
      : `Notiert, das sind ${countWord} heute. Etwas mehr Wasser wäre schön.`,
  appointment: (title, when) => `Ich habe ${title} für ${when} in Ihren Kalender eingetragen. Ich erinnere Sie rechtzeitig.`,
  alerted: "Erledigt, ich habe Ihrer Familie Bescheid gegeben. Jemand meldet sich bald bei Ihnen.",
  greeting: "Hallo, schön Sie zu hören. Wie geht es Ihnen heute?",
  smalltalk: "Ich höre zu. Erzählen Sie mir von Ihren Medikamenten oder Ihrem Tag, oder bitten Sie mich, die Familie anzurufen.",
  trouble: "Entschuldigung, bei mir ist etwas schiefgegangen. Ich bin noch da — sagen Sie es bitte noch einmal?",
};

const arabic: ReplyStrings = {
  and: "و",
  logged_taken: (tone) =>
    tone === "low"
      ? "شكرًا لك، سجّلت ذلك. سنأخذ الجرعة القادمة معًا."
      : tone === "great"
        ? "شكرًا لك، سجّلت ذلك. أنت تلتزمين بأدويتك بشكل ممتاز."
        : "شكرًا لك، سجّلت ذلك. أنت تبلين حسنًا هذا الأسبوع.",
  logged_missed: "لا مشكلة إطلاقًا، سجّلت أن الجرعة فاتت. هل أذكّرك لاحقًا أم أخبر عائلتك؟",
  care_plan: (remaining, allDone) =>
    allDone
      ? "لقد أخذت كل شيء على قائمتك اليوم. لم يتبقَّ شيء."
      : `ما زال لديك اليوم ${listWith(remaining, "و")}. هل أذكّرك عند الموعد؟`,
  checkin_meals: (skipped) =>
    skipped
      ? "شكرًا لإخباري، سجّلت ذلك. هل يمكنك تناول وجبة خفيفة؟"
      : "جميل، سجّلت ذلك. الأكل الجيد يُحدث فرقًا حقيقيًا.",
  checkin_mood: (tone) =>
    tone === "low"
      ? "سعيدة جدًا لأنك أخبرتني. أنا معك هنا — هل أخبر عائلتك، أم تحبين أن نتحدث قليلًا؟"
      : tone === "great"
        ? "سعيدة بسماع ذلك. حفظته مع أسبوعك."
        : "شكرًا لإخباري. سجّلت كيف تشعرين اليوم.",
  wellness: (mood, meds) =>
    `أسبوعك يبدو هادئًا. ${
      mood === "low" ? "كانت معنوياتك منخفضة قليلًا" : mood === "great" ? "كانت معنوياتك مرتفعة" : "كانت معنوياتك جيدة"
    } و${
      meds === "low" ? "فاتت بعض الجرعات" : meds === "great" ? "أخذت أدويتك جيدًا" : "التزمت بمعظم أدويتك"
    }.`,
  anomalies_none: "لا يبدو شيء غير معتاد. روتينك كان منتظمًا هذا الأسبوع.",
  anomalies_found: (detail) => `أمر صغير: ${detail}. لا داعي للقلق، لكن من الجيد الانتباه.`,
  hydration: (countWord, reachedGoal) =>
    reachedGoal
      ? "رائع، شربت ما يكفي من الماء اليوم. اكتمل هدف اليوم."
      : `سجّلت ذلك، أصبحت ${countWord} اليوم. قليل من الماء الإضافي سيكون جيدًا.`,
  appointment: (title, when) => `سجّلت ${title} في مفكرتك ليوم ${when}. سأذكّرك قبل الموعد.`,
  alerted: "تم، أبلغت عائلتك. سيطمئن عليك أحدهم قريبًا.",
  greeting: "مرحبًا، سعيدة بسماع صوتك. كيف تشعرين اليوم؟",
  smalltalk: "أنا أستمع. حدثيني عن دوائك أو عن يومك، أو اطلبي مني الاتصال بعائلتك.",
  trouble: "آسفة، حدث خطأ من جانبي. ما زلت هنا — هل يمكنك قول ذلك مرة أخرى؟",
};

const japanese: ReplyStrings = {
  and: "と",
  logged_taken: (tone) =>
    tone === "low"
      ? "ありがとうございます、記録しました。次の分は一緒に飲みましょう。"
      : tone === "great"
        ? "ありがとうございます、記録しました。お薬をとても順調に飲めていますね。"
        : "ありがとうございます、記録しました。今週は順調ですね。",
  logged_missed: "大丈夫ですよ、飲み忘れとして記録しました。後でお知らせしましょうか、ご家族にお伝えしましょうか。",
  care_plan: (remaining, allDone) =>
    allDone
      ? "今日の分はすべて飲み終えています。残りはありません。"
      : `今日はまだ${listWith(remaining, "と")}が残っています。時間になったらお知らせしましょうか。`,
  checkin_meals: (skipped) =>
    skipped
      ? "教えてくださってありがとうございます、記録しました。軽く何か召し上がれますか。"
      : "よかったです、記録しました。しっかり食べると本当に違いますよ。",
  checkin_mood: (tone) =>
    tone === "low"
      ? "話してくださって本当によかったです。そばにいますよ。ご家族にお伝えしましょうか、それとも少しお話ししますか。"
      : tone === "great"
        ? "それは何よりです。今週の記録に残しました。"
        : "教えてくださってありがとうございます。今日のお気持ちを記録しました。",
  wellness: (mood, meds) =>
    `今週は落ち着いています。${
      mood === "low" ? "気分は少し沈みぎみでした" : mood === "great" ? "気分はとても良好でした" : "気分は良好でした"
    }。${
      meds === "low" ? "お薬を少し飲み忘れました" : meds === "great" ? "お薬はきちんと飲めています" : "お薬はほぼ飲めています"
    }。`,
  anomalies_none: "変わった様子はありません。今週は落ち着いた生活でした。",
  anomalies_found: (detail) => `少し気になる点です。${detail}。心配はいりませんが、見ておきましょう。`,
  hydration: (countWord, reachedGoal) =>
    reachedGoal
      ? "よかったです、今日は十分に水分をとれました。今日の目標は達成です。"
      : `記録しました、今日は${countWord}です。もう少しお水を飲みましょう。`,
  appointment: (title, when) => `${title}を${when}の予定に入れました。近くなったらお知らせします。`,
  alerted: "お伝えしました。ご家族がまもなく連絡してくれます。",
  greeting: "こんにちは、お声が聞けてうれしいです。今日はいかがですか。",
  smalltalk: "聞いていますよ。お薬のことや今日のこと、ご家族への連絡など、何でもどうぞ。",
  trouble: "すみません、こちらで問題がありました。そばにいますので、もう一度お願いできますか。",
};

export const REPLIES: Record<LangCode, ReplyStrings> = {
  "en-IN": english,
  "en-US": english,
  "hi-IN": hindi,
  "ta-IN": tamil,
  "te-IN": telugu,
  "es-ES": spanish,
  "fr-FR": french,
  "de-DE": german,
  "ar-AE": arabic,
  "ja-JP": japanese,
};

export function repliesFor(lang: string): ReplyStrings {
  return REPLIES[resolveLang(lang).code];
}

// ------------------------------------------------------------------ numbers
const NUMBER_WORDS: Record<LangCode, string[]> = {
  "en-IN": ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
  "en-US": ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
  "hi-IN": ["शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह"],
  "ta-IN": ["பூஜ்ஜியம்", "ஒன்று", "இரண்டு", "மூன்று", "நான்கு", "ஐந்து", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது", "பத்து", "பதினொன்று", "பன்னிரண்டு"],
  "te-IN": ["సున్నా", "ఒకటి", "రెండు", "మూడు", "నాలుగు", "ఐదు", "ఆరు", "ఏడు", "ఎనిమిది", "తొమ్మిది", "పది", "పదకొండు", "పన్నెండు"],
  "es-ES": ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce"],
  "fr-FR": ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze"],
  "de-DE": ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf"],
  "ar-AE": ["صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر"],
  "ja-JP": ["ゼロ", "一杯", "二杯", "三杯", "四杯", "五杯", "六杯", "七杯", "八杯", "九杯", "十杯", "十一杯", "十二杯"],
};

/** Spell small counts out so they sound natural when spoken aloud. */
export function numberWord(value: number, lang = "en-US"): string {
  const table = NUMBER_WORDS[resolveLang(lang).code];
  const rounded = Math.max(0, Math.round(value));
  return table[rounded] ?? String(rounded);
}

/** Render a calendar day the way a person would say it, in their language. */
export function describeDate(iso: string, lang = "en-US", now = new Date()): string {
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;

  const startOfDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const today = new Date(`${now.toISOString().slice(0, 10)}T12:00:00Z`);
  const diffDays = Math.round((startOfDay(parsed) - startOfDay(today)) / 86400000);

  const locale = resolveLang(lang).code;
  try {
    if (diffDays > 0 && diffDays < 7) {
      return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(parsed);
    }
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(parsed);
  } catch {
    return iso;
  }
}

// ------------------------------------------------- tool findings & summaries
export type FindingKind = "missed_doses" | "skipped_meals" | "low_mood" | "low_hydration" | "no_checkins";

type FindingTexts = Record<FindingKind, (countWord: string, many: boolean) => string>;

const FINDINGS: Record<LangCode, FindingTexts> = {
  "en-US": {
    missed_doses: (c, many) => `${many ? "several doses were" : `${c} dose was`} missed this week`,
    skipped_meals: (c, many) => `${many ? "several meals were" : `${c} meal was`} skipped recently`,
    low_mood: () => "mood has been low for a few days",
    low_hydration: () => "water intake has been lower than usual",
    no_checkins: () => "there have been no check-ins yet",
  },
  "en-IN": {
    missed_doses: (c, many) => `${many ? "several doses were" : `${c} dose was`} missed this week`,
    skipped_meals: (c, many) => `${many ? "several meals were" : `${c} meal was`} skipped recently`,
    low_mood: () => "mood has been low for a few days",
    low_hydration: () => "water intake has been lower than usual",
    no_checkins: () => "there have been no check-ins yet",
  },
  "hi-IN": {
    missed_doses: (c, many) => `इस सप्ताह ${many ? "कई खुराकें" : `${c} खुराक`} छूट गई`,
    skipped_meals: (c, many) => `हाल में ${many ? "कई बार खाना" : `${c} बार खाना`} छूट गया`,
    low_mood: () => "कुछ दिनों से मन उदास है",
    low_hydration: () => "पानी सामान्य से कम पिया गया",
    no_checkins: () => "अभी तक कोई जानकारी दर्ज नहीं हुई",
  },
  "ta-IN": {
    missed_doses: (c, many) => `இந்த வாரம் ${many ? "பல மாத்திரைகள்" : `${c} மாத்திரை`} தவறியது`,
    skipped_meals: (c, many) => `சமீபத்தில் ${many ? "பல வேளை உணவு" : `${c} வேளை உணவு`} தவறியது`,
    low_mood: () => "சில நாட்களாக மனநிலை சோர்வாக உள்ளது",
    low_hydration: () => "வழக்கத்தை விட தண்ணீர் குறைவாக குடிக்கப்பட்டது",
    no_checkins: () => "இதுவரை எந்த பதிவும் இல்லை",
  },
  "te-IN": {
    missed_doses: (c, many) => `ఈ వారం ${many ? "చాలా మాత్రలు" : `${c} మాత్ర`} మిస్ అయ్యాయి`,
    skipped_meals: (c, many) => `ఇటీవల ${many ? "చాలాసార్లు భోజనం" : `${c} సారి భోజనం`} మిస్ అయింది`,
    low_mood: () => "కొన్ని రోజులుగా మనసు నిరుత్సాహంగా ఉంది",
    low_hydration: () => "మామూలు కంటే తక్కువ నీరు తాగారు",
    no_checkins: () => "ఇంకా ఎలాంటి నమోదు లేదు",
  },
  "es-ES": {
    missed_doses: (c, many) => `${many ? "faltaron varias dosis" : `faltó ${c} dosis`} esta semana`,
    skipped_meals: (c, many) => `${many ? "se saltaron varias comidas" : `se saltó ${c} comida`} hace poco`,
    low_mood: () => "el ánimo ha estado bajo unos días",
    low_hydration: () => "se ha bebido menos agua de lo habitual",
    no_checkins: () => "todavía no hay registros",
  },
  "fr-FR": {
    missed_doses: (c, many) => `${many ? "plusieurs doses ont été oubliées" : `${c} dose a été oubliée`} cette semaine`,
    skipped_meals: (c, many) => `${many ? "plusieurs repas ont été sautés" : `${c} repas a été sauté`} récemment`,
    low_mood: () => "le moral est bas depuis quelques jours",
    low_hydration: () => "vous avez bu moins d'eau que d'habitude",
    no_checkins: () => "il n'y a pas encore de suivi",
  },
  "de-DE": {
    missed_doses: (c, many) => `${many ? "mehrere Dosen wurden" : `${c} Dosis wurde`} diese Woche vergessen`,
    skipped_meals: (c, many) => `${many ? "mehrere Mahlzeiten wurden" : `${c} Mahlzeit wurde`} kürzlich ausgelassen`,
    low_mood: () => "die Stimmung ist seit einigen Tagen gedrückt",
    low_hydration: () => "es wurde weniger getrunken als sonst",
    no_checkins: () => "es gibt noch keine Einträge",
  },
  "ar-AE": {
    missed_doses: (c, many) => `${many ? "فاتت عدة جرعات" : `فاتت ${c} جرعة`} هذا الأسبوع`,
    skipped_meals: (c, many) => `${many ? "فاتت عدة وجبات" : `فاتت ${c} وجبة`} مؤخرًا`,
    low_mood: () => "المعنويات منخفضة منذ أيام",
    low_hydration: () => "شُرب ماء أقل من المعتاد",
    no_checkins: () => "لا توجد تسجيلات بعد",
  },
  "ja-JP": {
    missed_doses: (c, many) => `今週は${many ? "数回分" : c}のお薬を飲み忘れました`,
    skipped_meals: (c, many) => `最近${many ? "数回" : c}食事を抜きました`,
    low_mood: () => "ここ数日気分が沈みぎみです",
    low_hydration: () => "いつもより水分が少なめです",
    no_checkins: () => "まだ記録がありません",
  },
};

/** Turn a structured anomaly finding into a sentence in the chosen language. */
export function findingText(kind: string, count: number, lang: string): string {
  const texts = FINDINGS[resolveLang(lang).code];
  const handler = texts[kind as FindingKind];
  if (!handler) return "";
  return handler(numberWord(count, lang), count > 1);
}

// ------------------------------------------------------- tool chips (UI only)
type ToolChipStrings = {
  /** Human title for each tool. The tool *name* stays English. */
  titles: Record<string, string>;
  done: string;
  failed: string;
};

const CHIPS: Record<LangCode, ToolChipStrings> = {
  "en-US": {
    done: "done",
    failed: "failed",
    titles: {
      log_medication: "Medication logged",
      get_care_plan: "Care plan",
      daily_checkin: "Daily check-in",
      get_wellness_summary: "Wellness summary",
      detect_anomalies: "Routine check",
      log_hydration: "Water logged",
      add_appointment: "Appointment added",
      alert_family: "Family alerted",
    },
  },
  "en-IN": {
    done: "done",
    failed: "failed",
    titles: {
      log_medication: "Medication logged",
      get_care_plan: "Care plan",
      daily_checkin: "Daily check-in",
      get_wellness_summary: "Wellness summary",
      detect_anomalies: "Routine check",
      log_hydration: "Water logged",
      add_appointment: "Appointment added",
      alert_family: "Family alerted",
    },
  },
  "hi-IN": {
    done: "हो गया",
    failed: "विफल",
    titles: {
      log_medication: "दवा दर्ज",
      get_care_plan: "देखभाल योजना",
      daily_checkin: "दैनिक जाँच",
      get_wellness_summary: "साप्ताहिक सार",
      detect_anomalies: "दिनचर्या जाँच",
      log_hydration: "पानी दर्ज",
      add_appointment: "अपॉइंटमेंट जोड़ा",
      alert_family: "परिवार को सूचित",
    },
  },
  "ta-IN": {
    done: "முடிந்தது",
    failed: "தோல்வி",
    titles: {
      log_medication: "மருந்து பதிவு",
      get_care_plan: "பராமரிப்புத் திட்டம்",
      daily_checkin: "தினசரி பதிவு",
      get_wellness_summary: "வார சுருக்கம்",
      detect_anomalies: "வழக்கம் சோதனை",
      log_hydration: "தண்ணீர் பதிவு",
      add_appointment: "சந்திப்பு சேர்க்கப்பட்டது",
      alert_family: "குடும்பத்திற்கு அறிவிப்பு",
    },
  },
  "te-IN": {
    done: "పూర్తయింది",
    failed: "విఫలమైంది",
    titles: {
      log_medication: "మందు నమోదు",
      get_care_plan: "సంరక్షణ ప్రణాళిక",
      daily_checkin: "రోజువారీ నమోదు",
      get_wellness_summary: "వారపు సారాంశం",
      detect_anomalies: "దినచర్య తనిఖీ",
      log_hydration: "నీరు నమోదు",
      add_appointment: "అపాయింట్‌మెంట్ చేర్చబడింది",
      alert_family: "కుటుంబానికి సమాచారం",
    },
  },
  "es-ES": {
    done: "hecho",
    failed: "falló",
    titles: {
      log_medication: "Medicina registrada",
      get_care_plan: "Plan de cuidados",
      daily_checkin: "Registro diario",
      get_wellness_summary: "Resumen semanal",
      detect_anomalies: "Revisión de rutina",
      log_hydration: "Agua registrada",
      add_appointment: "Cita añadida",
      alert_family: "Familia avisada",
    },
  },
  "fr-FR": {
    done: "fait",
    failed: "échec",
    titles: {
      log_medication: "Médicament noté",
      get_care_plan: "Plan de soins",
      daily_checkin: "Suivi du jour",
      get_wellness_summary: "Résumé de la semaine",
      detect_anomalies: "Vérification de routine",
      log_hydration: "Eau notée",
      add_appointment: "Rendez-vous ajouté",
      alert_family: "Famille prévenue",
    },
  },
  "de-DE": {
    done: "erledigt",
    failed: "fehlgeschlagen",
    titles: {
      log_medication: "Medikament notiert",
      get_care_plan: "Medikamentenplan",
      daily_checkin: "Tages-Check-in",
      get_wellness_summary: "Wochenüberblick",
      detect_anomalies: "Routineprüfung",
      log_hydration: "Wasser notiert",
      add_appointment: "Termin eingetragen",
      alert_family: "Familie informiert",
    },
  },
  "ar-AE": {
    done: "تم",
    failed: "فشل",
    titles: {
      log_medication: "تسجيل الدواء",
      get_care_plan: "خطة الرعاية",
      daily_checkin: "تسجيل يومي",
      get_wellness_summary: "ملخص الأسبوع",
      detect_anomalies: "فحص الروتين",
      log_hydration: "تسجيل الماء",
      add_appointment: "إضافة موعد",
      alert_family: "إبلاغ العائلة",
    },
  },
  "ja-JP": {
    done: "完了",
    failed: "失敗",
    titles: {
      log_medication: "服薬を記録",
      get_care_plan: "服薬予定",
      daily_checkin: "今日の記録",
      get_wellness_summary: "今週のまとめ",
      detect_anomalies: "生活チェック",
      log_hydration: "水分を記録",
      add_appointment: "予定を追加",
      alert_family: "家族へ連絡",
    },
  },
};

/** Localised label for a tool chip. The English tool name is kept separately. */
export function toolChipLabel(name: string, status: string, lang: string) {
  const chips = CHIPS[resolveLang(lang).code];
  return {
    name,
    title: chips.titles[name] ?? name,
    status: status === "done" ? chips.done : chips.failed,
  };
}

/**
 * A short, translated sentence describing what a tool did.
 * The English `summary` returned by the tool itself is left untouched so the
 * MCP contract does not change.
 */
export function localizeToolSummary(name: string, data: unknown, lang: string): string {
  const code = resolveLang(lang).code;
  const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const nested = (key: string) => {
    const value = record[key];
    return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  };
  const t = REPLIES[code];

  switch (name) {
    case "log_medication": {
      const medication = String(record.medication ?? "");
      const missed = record.status === "missed";
      const word =
        code === "hi-IN" ? (missed ? "छूटी" : "ली गई")
        : code === "ta-IN" ? (missed ? "தவறியது" : "எடுக்கப்பட்டது")
        : code === "te-IN" ? (missed ? "మిస్ అయింది" : "తీసుకున్నారు")
        : code === "es-ES" ? (missed ? "no tomada" : "tomada")
        : code === "fr-FR" ? (missed ? "oubliée" : "prise")
        : code === "de-DE" ? (missed ? "ausgelassen" : "genommen")
        : code === "ar-AE" ? (missed ? "فاتت" : "أُخذت")
        : code === "ja-JP" ? (missed ? "飲み忘れ" : "服用済み")
        : missed ? "missed" : "taken";
      return `${medication}: ${word}`;
    }
    case "get_care_plan": {
      const remaining = Array.isArray(record.remaining) ? record.remaining.length : 0;
      return t.care_plan(
        (Array.isArray(record.remaining) ? record.remaining : []).map((item) =>
          String((item as Record<string, unknown>)?.medication ?? ""),
        ),
        remaining === 0,
      );
    }
    case "log_hydration": {
      const hydration = nested("hydration");
      const today = Number(hydration.today ?? record.glasses ?? 0);
      const goal = Number(hydration.goal ?? 8);
      return t.hydration(numberWord(today, code), today >= goal);
    }
    case "add_appointment":
      return t.appointment(String(record.title ?? ""), describeDate(String(record.date ?? ""), code));
    case "alert_family":
      return t.alerted;
    case "daily_checkin":
      return t.checkin_mood("good");
    case "detect_anomalies": {
      const findings = Array.isArray(record.findings) ? record.findings : [];
      if (findings.length === 0) return t.anomalies_none;
      const first = findings[0] as Record<string, unknown>;
      return findingText(String(first.kind ?? ""), Number(first.count ?? 1), code) || t.anomalies_none;
    }
    case "get_wellness_summary":
      return t.wellness("good", "good");
    default:
      return "";
  }
}
