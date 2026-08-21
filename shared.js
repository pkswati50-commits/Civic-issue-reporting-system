

const CATEGORY_WEIGHTS = {
  manhole:     { label: "Open Manhole",     icon: "\u26A0\uFE0F", weight: 5, slaHours: 12 },
  pothole:     { label: "Pothole",          icon: "\uD83D\uDD73\uFE0F", weight: 4, slaHours: 48 },
  electrical:  { label: "Exposed Wiring",   icon: "\u26A1", weight: 5, slaHours: 12 },
  streetlight: { label: "Streetlight Out",  icon: "\uD83D\uDCA1", weight: 2, slaHours: 96 },
  garbage:     { label: "Garbage Pileup",   icon: "\uD83D\uDDD1\uFE0F", weight: 3, slaHours: 72 },
  water:       { label: "Water Leakage",    icon: "\uD83D\uDEB0", weight: 4, slaHours: 36 },
  drainage:    { label: "Blocked Drain",    icon: "\uD83C\uDF27\uFE0F", weight: 3, slaHours: 60 },
  signage:     { label: "Damaged Signage",  icon: "\uD83D\uDEA7", weight: 2, slaHours: 96 },
  treefall:    { label: "Fallen Tree",      icon: "\uD83C\uDF33", weight: 4, slaHours: 24 },
  other:       { label: "Other",            icon: "\uD83D\uDCCC", weight: 2, slaHours: 96 },
};
function computeSeverity(categoryKey, confirmations = 0) {
  const base = CATEGORY_WEIGHTS[categoryKey]?.weight ?? 2;
  const bump = confirmations >= 15 ? 2 : confirmations >= 6 ? 1 : 0;
  const score = Math.min(base + bump, 5);
  if (score >= 5) return { tier: "critical", label: "Critical", score };
  if (score >= 4) return { tier: "high", label: "High", score };
  if (score >= 3) return { tier: "medium", label: "Medium", score };
  return { tier: "low", label: "Low", score };
}
function slaRemainingFraction(categoryKey, reportedAtISO) {
  const slaHours = CATEGORY_WEIGHTS[categoryKey]?.slaHours ?? 72;
  const reportedAt = new Date(reportedAtISO).getTime();
  const deadline = reportedAt + slaHours * 3600 * 1000;
  const now = Date.now();
  const remaining = deadline - now;
  const total = slaHours * 3600 * 1000;
  return Math.max(0, Math.min(1, remaining / total));
}
function slaHoursLeft(categoryKey, reportedAtISO) {
  const slaHours = CATEGORY_WEIGHTS[categoryKey]?.slaHours ?? 72;
  const reportedAt = new Date(reportedAtISO).getTime();
  const deadline = reportedAt + slaHours * 3600 * 1000;
  const hrs = Math.round((deadline - Date.now()) / 3600000);
  return hrs;
}
function ringColorForFraction(frac) {
  if (frac <= 0.15) return "var(--sev-critical)";
  if (frac <= 0.4) return "var(--sev-high)";
  if (frac <= 0.7) return "var(--sev-medium)";
  return "var(--sev-low)";
}
const MOCK_REPORTS = [
  {
    id: "SETU-1042", category: "manhole", area: "Jayanagar 4th Block",
    reportedAt: isoHoursAgo(9), confirmations: 18, status: "open",
    citizen: "R. Kumar", photoCount: 2,
  },
  {
    id: "SETU-1041", category: "pothole", area: "Outer Ring Rd, Marathahalli",
    reportedAt: isoHoursAgo(30), confirmations: 7, status: "in_progress",
    citizen: "A. Fernandes", photoCount: 3,
  },
  {
    id: "SETU-1039", category: "streetlight", area: "HSR Layout Sector 2",
    reportedAt: isoHoursAgo(60), confirmations: 3, status: "open",
    citizen: "S. Iyer", photoCount: 1,
  },
  {
    id: "SETU-1037", category: "garbage", area: "Koramangala 5th Block",
    reportedAt: isoHoursAgo(50), confirmations: 11, status: "open",
    citizen: "M. Bhat", photoCount: 4,
  },
  {
    id: "SETU-1033", category: "water", area: "Indiranagar 100ft Rd",
    reportedAt: isoHoursAgo(20), confirmations: 5, status: "in_progress",
    citizen: "P. Rao", photoCount: 2,
  },
  {
    id: "SETU-1029", category: "electrical", area: "Whitefield Main Rd",
    reportedAt: isoHoursAgo(5), confirmations: 9, status: "open",
    citizen: "K. Reddy", photoCount: 2,
  },
  {
    id: "SETU-1021", category: "drainage", area: "BTM Layout 2nd Stage",
    reportedAt: isoHoursAgo(80), confirmations: 4, status: "resolved",
    citizen: "N. Das", photoCount: 2,
  },
  {
    id: "SETU-1018", category: "treefall", area: "Malleshwaram 8th Cross",
    reportedAt: isoHoursAgo(14), confirmations: 6, status: "open",
    citizen: "V. Shetty", photoCount: 3,
  },
];

function isoHoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}
const LANG_CATEGORY_KEYWORDS = {
  manhole: [
   
    "manhole","open drain","uncovered hole","open hole","missing cover",
    
    "ಮ್ಯಾನ್‌ಹೋಲ್","ಗುಂಡಿ","ತೆರೆದ ಗುಂಡಿ","ಮೋರಿ",
    
    "मैनहोल","खुला गड्ढा","ढक्कन नहीं","नाला खुला",
    
    "மேன்ஹோல்","திறந்த குழி","மூடி இல்லை",
    
    "మ్యాన్‌హోల్","తెరిచిన గుంట","మూత లేదు",
   
    "മൻഹോൾ","തുറന്ന കുഴി",
    
    "मॅनहोल","उघडा गड्डा","झाकण नाही",

    "મૅનહોલ","ખુલ્લો ખાડો",
   
    "ম্যানহোল","খোলা গর্ত",
  ],
  pothole: [
    "pothole","road hole","road damage","broken road","road crack","pit on road",
    "ರಸ್ತೆ ಗುಂಡಿ","ದೊಡ್ಡ ಗುಂಡಿ","ರಸ್ತೆ ಹಾಳು","ರಸ್ತೆಯಲ್ಲಿ ಗುಂಡಿ",
    "सड़क गड्ढा","रोड गड्ढा","टूटी सड़क","खड्डा",
    "சாலை குழி","பள்ளம்","சாலை பாதிப்பு",
    "రోడ్డు గుంత","రోడ్డు పాడైంది",
    "റോഡ് കുഴി","റോഡ് നശിച്ചു",
    "रस्त्यात खड्डा","रस्ता खराब",
    "રસ્તામાં ખાડો","રોડ ખરાબ",
    "রাস্তায় গর্ত","রাস্তা ভাঙা",
  ],
  electrical: [
    "wire","exposed wire","electric wire","live wire","electricity","wiring","shock","electrocution",
    "ತಂತಿ","ವಿದ್ಯುತ್ ತಂತಿ","ಕರೆಂಟ್ ತಂತಿ","ಬೆಂಕಿ ತಂತಿ",
    "तार","बिजली का तार","खुला तार","करंट",
    "மின்சாரம்","தந்தி","மின் கம்பி",
    "తీగ","విద్యుత్ తీగ","కరెంట్",
    "വയർ","വൈദ്യുതി","കമ്പി",
    "वायर","विजेचा तार","करंट",
    "વાયર","વીજળી","તાર",
    "তার","বিদ্যুৎ","বৈদ্যুতিক",
  ],
  streetlight: [
    "streetlight","street light","light not working","lamp post","dark road","no light",
    "ಬೀದಿ ದೀಪ","ಲ್ಯಾಂಪ್","ದೀಪ ಹಾಳು","ಕತ್ತಲು",
    "स्ट्रीट लाइट","रोड लाइट","बत्ती नहीं","अँधेरा",
    "தெரு விளக்கு","விளக்கு எரியவில்லை",
    "వీధి దీపం","లైట్ పని చేయడం లేదు",
    "തെരുവ് വിളക്ക്","വിളക്ക് കത്തുന്നില്ല",
    "रस्त्यावरचा दिवा","दिवा बंद",
    "શેરી લાઇટ","લાઇટ ચાલુ નથી",
    "রাস্তার আলো","আলো নেই",
  ],
  garbage: [
    "garbage","trash","waste","rubbish","filth","dirty","litter","dumping","dump",
    "ಕಸ","ತ್ಯಾಜ್ಯ","ಗಲೀಜು","ಕಸದ ರಾಶಿ","ಕಸ ಬಿದ್ದಿದೆ",
    "कचरा","गंदगी","कूड़ा","सफाई नहीं",
    "குப்பை","கழிவு","அழுக்கு",
    "చెత్త","వ్యర్థాలు","మురికి",
    "മാലിന്യം","ചപ്പ്","ഗാർബേജ്",
    "कचरा","घाण","कूड़ा",
    "કચરો","ગંદકી",
    "আবর্জনা","ময়লা",
  ],
  water: [
    "water leak","pipe burst","water flowing","flooding","water supply","leakage","pipeline",
    "ನೀರು ಸೋರುತ್ತಿದೆ","ಪೈಪ್ ಒಡೆದಿದೆ","ನೀರು ವ್ಯರ್ಥ","ನೀರು ತುಂಬಿ",
    "पानी लीक","पाइप फटा","पानी बह रहा","जलजमाव",
    "தண்ணீர் கசிவு","குழாய் உடைந்தது","தண்ணீர் வீணாகிறது",
    "నీళ్ళు లీకవుతున్నాయి","పైప్ పగిలింది",
    "വെള്ളം ചോർക്കൽ","പൈപ്പ് പൊട്ടി",
    "पाणी गळत","पाइप फुटला",
    "પાણી લીક","પાઈપ ફૂટી",
    "জল লিক","পাইপ ফেটে",
  ],
  drainage: [
    "drain","blocked drain","clogged","overflow","sewage","stagnant water","waterlogging",
    "ಚರಂಡಿ","ಒಳಚರಂಡಿ","ನೀರು ನಿಂತಿದೆ","ಮೋರಿ ತುಂಬಿದೆ",
    "नाली","सीवर","पानी भरा","जल भराव",
    "சாக்கடை","தடைப்பட்ட நீர்","சேற்றுநீர்",
    "కాలువ","మురుగు","నీళ్ళు నిలిచాయి",
    "ഡ്രൈനേജ്","ഓടകൾ","വെള്ളം കെട്ടി",
    "गटार","तुंबले","पाणी साठले",
    "ગટર","ભરાઈ ગઈ","ઊભું પાણી",
    "নর্দমা","জলাবদ্ধতা","আটকে গেছে",
  ],
  treefall: [
    "tree fall","fallen tree","tree down","branch","uprooted","tree blocked road",
    "ಮರ ಬಿದ್ದಿದೆ","ಮರ ಉರುಳಿದೆ","ಮರ ರಸ್ತೆ ಮೇಲೆ",
    "पेड़ गिरा","पेड़ टूटा","पेड़ रास्ते में",
    "மரம் விழுந்தது","மரம் சாய்ந்தது",
    "చెట్టు పడింది","చెట్టు విరిగింది",
    "മരം വീണു","മരം ഒടിഞ്ഞു",
    "झाड पडले","झाड तुटले",
    "ઝાડ પડ્યું","ઝાડ તૂટ્યું",
    "গাছ পড়েছে","গাছ ভেঙেছে",
  ],
  signage: [
    "sign","signage","board","broken sign","missing sign","traffic sign","signal",
    "ಸೈನ್‌ಬೋರ್ಡ್","ಬೋರ್ಡ್ ಮುರಿದಿದೆ","ಟ್ರಾಫಿಕ್ ಸೈನ್",
    "साइनबोर्ड","बोर्ड टूटा","सड़क चिह्न",
    "அடையாளப் பலகை","பலகை உடைந்தது",
    "సైన్ బోర్డ్","బోర్డ్ విరిగింది",
    "ബോർഡ്","ചിഹ്നം","സൈൻ",
    "साइनबोर्ड","फलक तुटले",
    "સાઇનબોર્ડ","ફલક તૂટ્યું",
    "সাইনবোর্ড","ফলক ভেঙেছে",
  ],
};
function detectCategoryFromTranscript(transcript) {
  const text = transcript.toLowerCase();
  let bestKey = null, bestScore = 0;
  for (const [cat, keywords] of Object.entries(LANG_CATEGORY_KEYWORDS)) {
    const score = keywords.reduce((n, kw) => n + (text.includes(kw.toLowerCase()) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; bestKey = cat; }
  }
  return bestScore > 0 ? bestKey : null;
}
const UI_STRINGS = {
  "en-IN": {
    formTitle: "What's the issue?",
    voiceLabel: "🎤 Speak your report",
    voiceSub: "Tap the mic and describe the issue in your language",
    listening: "🔴 Listening… speak now",
    processing: "Processing…",
    placeholder: "Briefly describe what you're seeing…",
    submitBtn: "Submit report",
    locateBtn: "📍 Use my location",
    nameLabel: "Your name",
    phoneLabel: "Phone",
    addressLabel: "Address / landmark",
    descLabel: "Description",
    applyBtn: "✓ Apply to form",
    retryBtn: "↺ Retry",
    voiceNotSupported: "Voice input not supported in this browser. Try Chrome.",
    categoryLabel: "Category",
    severityLabel: "Severity",
  },
  "kn-IN": {
    formTitle: "ಸಮಸ್ಯೆ ಏನು?",
    voiceLabel: "🎤 ನಿಮ್ಮ ದೂರು ಹೇಳಿ",
    voiceSub: "ಮೈಕ್ ಒತ್ತಿ ಕನ್ನಡದಲ್ಲಿ ಸಮಸ್ಯೆ ವಿವರಿಸಿ",
    listening: "🔴 ಕೇಳುತ್ತಿದ್ದೇನೆ… ಮಾತನಾಡಿ",
    processing: "ಪ್ರಕ್ರಿಯೆ ನಡೆಯುತ್ತಿದೆ…",
    placeholder: "ನೀವು ನೋಡುತ್ತಿರುವುದನ್ನು ಸಂಕ್ಷಿಪ್ತವಾಗಿ ವಿವರಿಸಿ…",
    submitBtn: "ದೂರು ಸಲ್ಲಿಸಿ",
    locateBtn: "📍 ನನ್ನ ಸ್ಥಳ ಬಳಸಿ",
    nameLabel: "ನಿಮ್ಮ ಹೆಸರು",
    phoneLabel: "ಫೋನ್",
    addressLabel: "ವಿಳಾಸ / ಮೈಲಿಗಲ್ಲು",
    descLabel: "ವಿವರಣೆ",
    applyBtn: "✓ ಫಾರ್ಮ್‌ಗೆ ಅನ್ವಯಿಸಿ",
    retryBtn: "↺ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    voiceNotSupported: "ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಧ್ವನಿ ಇನ್‌ಪುಟ್ ಲಭ್ಯವಿಲ್ಲ.",
    categoryLabel: "ವಿಭಾಗ",
    severityLabel: "ತೀವ್ರತೆ",
  },
  "hi-IN": {
    formTitle: "समस्या क्या है?",
    voiceLabel: "🎤 अपनी शिकायत बोलें",
    voiceSub: "माइक दबाएँ और हिंदी में समस्या बताएँ",
    listening: "🔴 सुन रहा हूँ… बोलिए",
    processing: "प्रोसेस हो रहा है…",
    placeholder: "जो देख रहे हैं वो संक्षेप में बताएँ…",
    submitBtn: "रिपोर्ट दर्ज करें",
    locateBtn: "📍 मेरी लोकेशन उपयोग करें",
    nameLabel: "आपका नाम",
    phoneLabel: "फ़ोन",
    addressLabel: "पता / लैंडमार्क",
    descLabel: "विवरण",
    applyBtn: "✓ फ़ॉर्म में लगाएँ",
    retryBtn: "↺ दोबारा कोशिश करें",
    voiceNotSupported: "इस ब्राउज़र में वॉइस इनपुट उपलब्ध नहीं है।",
    categoryLabel: "श्रेणी",
    severityLabel: "गंभीरता",
  },
  "ta-IN": {
    formTitle: "பிரச்சனை என்ன?",
    voiceLabel: "🎤 உங்கள் புகாரை சொல்லுங்கள்",
    voiceSub: "மைக்கை அழுத்தி தமிழில் பிரச்சனையை விவரிக்கவும்",
    listening: "🔴 கேட்கிறேன்… பேசுங்கள்",
    processing: "செயலாக்கப்படுகிறது…",
    placeholder: "நீங்கள் பார்ப்பதை சுருக்கமாக விவரிக்கவும்…",
    submitBtn: "புகார் சமர்ப்பிக்கவும்",
    locateBtn: "📍 என் இருப்பிடம் பயன்படுத்து",
    nameLabel: "உங்கள் பெயர்",
    phoneLabel: "தொலைபேசி",
    addressLabel: "முகவரி / அடையாளம்",
    descLabel: "விவரம்",
    applyBtn: "✓ படிவத்தில் பயன்படுத்து",
    retryBtn: "↺ மீண்டும் முயற்சிக்கவும்",
    voiceNotSupported: "இந்த உலாவியில் குரல் உள்ளீடு ஆதரிக்கப்படவில்லை.",
    categoryLabel: "வகை",
    severityLabel: "தீவிரம்",
  },
  "te-IN": {
    formTitle: "సమస్య ఏమిటి?",
    voiceLabel: "🎤 మీ ఫిర్యాదు చెప్పండి",
    voiceSub: "మైక్ నొక్కి తెలుగులో సమస్య వివరించండి",
    listening: "🔴 వింటున్నాను… మాట్లాడండి",
    processing: "ప్రాసెస్ అవుతోంది…",
    placeholder: "మీరు చూస్తున్నదాన్ని సంక్షిప్తంగా వివరించండి…",
    submitBtn: "నివేదిక సమర్పించండి",
    locateBtn: "📍 నా స్థానం వాడు",
    nameLabel: "మీ పేరు",
    phoneLabel: "ఫోన్",
    addressLabel: "చిరునామా / ల్యాండ్‌మార్క్",
    descLabel: "వివరణ",
    applyBtn: "✓ ఫారమ్‌కు వర్తించు",
    retryBtn: "↺ మళ్ళీ ప్రయత్నించు",
    voiceNotSupported: "ఈ బ్రౌజర్‌లో వాయిస్ ఇన్‌పుట్ మద్దతు లేదు.",
    categoryLabel: "వర్గం",
    severityLabel: "తీవ్రత",
  },
  "ml-IN": {
    formTitle: "എന്താണ് പ്രശ്നം?",
    voiceLabel: "🎤 നിങ്ങളുടെ പരാതി പറയൂ",
    voiceSub: "മൈക്ക് അമർത്തി മലയാളത്തിൽ പ്രശ്നം വിവരിക്കൂ",
    listening: "🔴 കേൾക്കുന്നു… സംസാരിക്കൂ",
    processing: "പ്രോസസ് ചെയ്യുന്നു…",
    placeholder: "നിങ്ങൾ കാണുന്നത് ചുരുക്കി വിവരിക്കൂ…",
    submitBtn: "റിപ്പോർട്ട് സമർപ്പിക്കൂ",
    locateBtn: "📍 എന്റെ സ്ഥാനം ഉപയോഗിക്കൂ",
    nameLabel: "നിങ്ങളുടെ പേര്",
    phoneLabel: "ഫോൺ",
    addressLabel: "മേൽവിലാസം / ലാൻഡ്‌മാർക്ക്",
    descLabel: "വിവരണം",
    applyBtn: "✓ ഫോമിൽ പ്രയോഗിക്കൂ",
    retryBtn: "↺ വീണ്ടും ശ്രമിക്കൂ",
    voiceNotSupported: "ഈ ബ്രൗസറിൽ വോയ്‌സ് ഇൻപുട്ട് പ്രവർത്തിക്കില്ല.",
    categoryLabel: "വിഭാഗം",
    severityLabel: "ഗൗരവം",
  },
  "mr-IN": {
    formTitle: "समस्या काय आहे?",
    voiceLabel: "🎤 तुमची तक्रार सांगा",
    voiceSub: "मायक्रोफोन दाबा आणि मराठीत समस्या सांगा",
    listening: "🔴 ऐकत आहे… बोला",
    processing: "प्रक्रिया सुरू आहे…",
    placeholder: "तुम्ही काय पाहत आहात ते थोडक्यात सांगा…",
    submitBtn: "तक्रार नोंदवा",
    locateBtn: "📍 माझे स्थान वापरा",
    nameLabel: "तुमचे नाव",
    phoneLabel: "फोन",
    addressLabel: "पत्ता / खूण",
    descLabel: "वर्णन",
    applyBtn: "✓ फॉर्मला लागू करा",
    retryBtn: "↺ पुन्हा प्रयत्न करा",
    voiceNotSupported: "या ब्राउझरमध्ये व्हॉइस इनपुट उपलब्ध नाही.",
    categoryLabel: "श्रेणी",
    severityLabel: "तीव्रता",
  },
  "gu-IN": {
    formTitle: "સમસ્યા શું છે?",
    voiceLabel: "🎤 તમારી ફરિયાદ બોલો",
    voiceSub: "માઇક દબાવો અને ગુજરાતીમાં સમસ્યા જણાવો",
    listening: "🔴 સાંભળી રહ્યો છું… બોલો",
    processing: "પ્રક્રિયા ચાલી રહી છે…",
    placeholder: "તમે શું જોઈ રહ્યા છો તે સંક્ષિપ્તમાં જણાવો…",
    submitBtn: "ફરિયાદ નોંધાવો",
    locateBtn: "📍 મારું સ્થાન વાપરો",
    nameLabel: "તમારું નામ",
    phoneLabel: "ફોન",
    addressLabel: "સરનામું / લેન્ડમાર્ક",
    descLabel: "વર્ણન",
    applyBtn: "✓ ફોર્મ પર લાગુ કરો",
    retryBtn: "↺ ફરી પ્રયાસ કરો",
    voiceNotSupported: "આ બ્રાઉઝરમાં વૉઇસ ઇનપુટ ઉપલબ્ધ નથી.",
    categoryLabel: "શ્રેણી",
    severityLabel: "ગંભીરતા",
  },
  "bn-IN": {
    formTitle: "সমস্যাটি কী?",
    voiceLabel: "🎤 আপনার অভিযোগ বলুন",
    voiceSub: "মাইক চাপুন এবং বাংলায় সমস্যা বর্ণনা করুন",
    listening: "🔴 শুনছি… বলুন",
    processing: "প্রক্রিয়া চলছে…",
    placeholder: "আপনি কী দেখছেন তা সংক্ষেপে বর্ণনা করুন…",
    submitBtn: "অভিযোগ জমা দিন",
    locateBtn: "📍 আমার অবস্থান ব্যবহার করুন",
    nameLabel: "আপনার নাম",
    phoneLabel: "ফোন",
    addressLabel: "ঠিকানা / ল্যান্ডমার্ক",
    descLabel: "বিবরণ",
    applyBtn: "✓ ফর্মে প্রয়োগ করুন",
    retryBtn: "↺ আবার চেষ্টা করুন",
    voiceNotSupported: "এই ব্রাউজারে ভয়েস ইনপুট সমর্থিত নয়।",
    categoryLabel: "বিভাগ",
    severityLabel: "তীব্রতা",
  },
};
const CRITICAL_LOCATIONS = [
  // Schools
  { name: "Baldwin Boys High School",      type: "school",     lat: 12.9719, lng: 77.5937, icon: "🏫" },
  { name: "St. Joseph's Boys High School", type: "school",     lat: 12.9741, lng: 77.5956, icon: "🏫" },
  { name: "National Public School",        type: "school",     lat: 12.9512, lng: 77.6412, icon: "🏫" },
  { name: "Kendriya Vidyalaya",            type: "school",     lat: 12.9840, lng: 77.5680, icon: "🏫" },
  { name: "DPS Bangalore",                 type: "school",     lat: 12.9123, lng: 77.6789, icon: "🏫" },
  { name: "Victoria Hospital",             type: "hospital",   lat: 12.9631, lng: 77.5796, icon: "🏥" },
  { name: "Manipal Hospital",              type: "hospital",   lat: 12.9527, lng: 77.6487, icon: "🏥" },
  { name: "St. John's Medical College",    type: "hospital",   lat: 12.9258, lng: 77.6251, icon: "🏥" },
  { name: "Fortis Hospital Bannerghatta",  type: "hospital",   lat: 12.8897, lng: 77.5978, icon: "🏥" },
  { name: "Narayana Health City",          type: "hospital",   lat: 12.8912, lng: 77.6034, icon: "🏥" },
  { name: "Majestic Bus Terminal",         type: "bus_stop",   lat: 12.9775, lng: 77.5713, icon: "🚌" },
  { name: "Shivajinagar Bus Stand",        type: "bus_stop",   lat: 12.9851, lng: 77.6006, icon: "🚌" },
  { name: "Silk Board Bus Stop",           type: "bus_stop",   lat: 12.9177, lng: 77.6228, icon: "🚌" },
  { name: "Marathahalli Bus Stop",         type: "bus_stop",   lat: 12.9591, lng: 77.6974, icon: "🚌" },
  { name: "Koramangala Bus Stop",          type: "bus_stop",   lat: 12.9340, lng: 77.6269, icon: "🚌" },
  { name: "Bangalore City Railway Station",type: "railway",    lat: 12.9775, lng: 77.5713, icon: "🚂" },
  { name: "Yeshwanthpur Railway Station",  type: "railway",    lat: 13.0210, lng: 77.5499, icon: "🚂" },
  { name: "Cantonment Railway Station",    type: "railway",    lat: 12.9940, lng: 77.5973, icon: "🚂" },
  { name: "Bangalore East Station",        type: "railway",    lat: 12.9840, lng: 77.6312, icon: "🚂" },
  { name: "BBMP Head Office",              type: "government", lat: 12.9795, lng: 77.5906, icon: "🏛️" },
  { name: "Bruhat Bengaluru Mahanagara",   type: "government", lat: 12.9761, lng: 77.5892, icon: "🏛️" },
  { name: "Vidhana Soudha",               type: "government", lat: 12.9795, lng: 77.5907, icon: "🏛️" },
  { name: "DC Office Bangalore Urban",     type: "government", lat: 12.9731, lng: 77.5852, icon: "🏛️" },
  { name: "Silk Board Junction",           type: "major_road", lat: 12.9177, lng: 77.6228, icon: "🛣️" },
  { name: "Hebbal Flyover",                type: "major_road", lat: 13.0358, lng: 77.5970, icon: "🛣️" },
  { name: "KR Puram Junction",             type: "major_road", lat: 13.0089, lng: 77.6923, icon: "🛣️" },
  { name: "Electronic City Toll",          type: "major_road", lat: 12.8399, lng: 77.6770, icon: "🛣️" },
  { name: "Hosur Road–Outer Ring Road",    type: "major_road", lat: 12.9177, lng: 77.6298, icon: "🛣️" },
];
const LOCATION_TYPE_PRIORITY = {
  hospital:   { label: "Hospital",          boost: 2.0 },
  school:     { label: "School",            boost: 1.8 },
  railway:    { label: "Railway Station",   boost: 1.5 },
  bus_stop:   { label: "Bus Stop",          boost: 1.3 },
  government: { label: "Govt. Office",      boost: 1.2 },
  major_road: { label: "Major Road",        boost: 1.4 },
};
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function getNearbyLocations(lat, lng, radiusM = 500, limit = 5) {
  return CRITICAL_LOCATIONS
    .map(loc => ({ ...loc, distM: Math.round(haversineMetres(lat, lng, loc.lat, loc.lng)) }))
    .filter(loc => loc.distM <= radiusM)
    .sort((a, b) => a.distM - b.distM)
    .slice(0, limit);
}
function getLocationImpact(lat, lng, categoryKey, confirmations = 0, radiusM = 2000) {
  const nearby = getNearbyLocations(lat, lng, radiusM);
  const baseSev = computeSeverity(categoryKey, confirmations);
  if (nearby.length === 0) {
    return { isHighImpact: false, boostedSeverity: baseSev, nearbyCount: 0, locations: [], alertLines: [] };
  }
  const maxBoost = Math.max(...nearby.map(l => LOCATION_TYPE_PRIORITY[l.type]?.boost ?? 1));
  const boostedScore = Math.min(Math.round(baseSev.score * maxBoost), 5);
  let boostedSeverity = baseSev;
  if (boostedScore >= 5) boostedSeverity = { tier: "critical", label: "Critical", score: 5 };
  else if (boostedScore >= 4) boostedSeverity = { tier: "high",     label: "High",     score: 4 };
  else if (boostedScore >= 3) boostedSeverity = { tier: "medium",   label: "Medium",   score: 3 };
  else                         boostedSeverity = { tier: "low",      label: "Low",      score: 2 };
  const isHighImpact = boostedSeverity.tier !== baseSev.tier || nearby.length >= 2;
  const alertLines = nearby.map(l =>
    `${l.icon} ${l.distM}m from ${l.name} (${LOCATION_TYPE_PRIORITY[l.type]?.label ?? l.type})`
  );
  return { isHighImpact, boostedSeverity, nearbyCount: nearby.length, locations: nearby, alertLines };
}

const OFFLINE_QUEUE_KEY = "setu_offline_queue";
function offlineQueuePush(report) {
  const queue = offlineQueueGet();
  queue.push({ ...report, _offlineId: `OFF-${Date.now()}`, _savedAt: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}
function offlineQueueGet() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); }
  catch { return []; }
}
function offlineQueueRemove(offlineId) {
  const queue = offlineQueueGet().filter(r => r._offlineId !== offlineId);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}
function offlineQueueClear() {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}
function offlineSyncAll(onProgress) {
  const queue = offlineQueueGet();
  if (!queue.length) return Promise.resolve([]);

  return new Promise(resolve => {
    let synced = [];
    let idx = 0;

    function syncNext() {
      if (idx >= queue.length) {
        offlineQueueClear();
        window.dispatchEvent(new CustomEvent("setuSyncComplete", { detail: { synced } }));
        resolve(synced);
        return;
      }
      const report = queue[idx++];
      // Simulate async network call (replace with real fetch in production)
      setTimeout(() => {
        synced.push(report._offlineId);
        if (onProgress) onProgress(synced.length, queue.length, report);
        syncNext();
      }, 400);
    }
    syncNext();
  });
}
function initOfflineSync(onSynced) {
  if (navigator.onLine && offlineQueueGet().length > 0) {
    offlineSyncAll(onSynced);
  }
  window.addEventListener("online", () => {
    if (offlineQueueGet().length > 0) {
      offlineSyncAll(onSynced);
    }
  });
}
