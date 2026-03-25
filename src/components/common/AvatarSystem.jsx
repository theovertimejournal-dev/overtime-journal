/**
 * AvatarSystem.jsx — OTJ Avatar System (DiceBear Avataaars)
 * Uses DiceBear API CDN for rendering. No npm dependency on client.
 * Supports future custom SVG parts.
 */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

function buildAvatarUrl(config = {}, size = 200) {
    const p = new URLSearchParams();
    const fields = ['top','hairColor','accessories','accessoriesColor','facialHair','facialHairColor','clothing','clothesColor','clothingGraphic','eyes','eyebrows','mouth','skinColor','style'];
    fields.forEach(f => { if (config[f]) p.set(f, config[f]); });
    p.set('size', size);
    if (!config.style) p.set('style', 'default');
    return `https://api.dicebear.com/9.x/avataaars/svg?${p.toString()}`;
}

const HAIR_STYLES = [
    {id:'shortFlat',label:'Short Flat'},{id:'shortRound',label:'Short Round'},{id:'shortWaved',label:'Short Waved'},
    {id:'shortCurly',label:'Short Curly'},{id:'theCaesar',label:'Caesar'},{id:'theCaesarAndSidePart',label:'Caesar Side'},
    {id:'sides',label:'Sides'},{id:'shavedSides',label:'Shaved Sides'},{id:'bob',label:'Bob'},{id:'bun',label:'Bun'},
    {id:'straight01',label:'Straight'},{id:'straight02',label:'Straight Long'},{id:'straightAndStrand',label:'Strand'},
    {id:'longButNotTooLong',label:'Medium Long'},{id:'miaWallace',label:'Mia Wallace'},{id:'curly',label:'Curly'},
    {id:'curvy',label:'Curvy'},{id:'dreads',label:'Dreads'},{id:'dreads01',label:'Dreads Short'},
    {id:'dreads02',label:'Dreads Long'},{id:'fro',label:'Afro'},{id:'froBand',label:'Afro Band'},
    {id:'frizzle',label:'Frizzle'},{id:'shaggy',label:'Shaggy'},{id:'shaggyMullet',label:'Mullet'},
    {id:'bigHair',label:'Big Hair'},{id:'hat',label:'Beanie'},{id:'hijab',label:'Hijab'},
    {id:'turban',label:'Turban'},{id:'winterHat1',label:'Winter Hat 1'},{id:'winterHat02',label:'Winter Hat 2'},
    {id:'winterHat03',label:'Pom Pom'},{id:'winterHat04',label:'Ear Flap'},
];

const HAIR_COLORS = [
    {id:'2c1b18',label:'Black',color:'#2c1b18'},{id:'4a3728',label:'Dark Brown',color:'#4a3728'},
    {id:'724133',label:'Brown',color:'#724133'},{id:'a55728',label:'Auburn',color:'#a55728'},
    {id:'b58143',label:'Light Brown',color:'#b58143'},{id:'d6b370',label:'Dirty Blonde',color:'#d6b370'},
    {id:'e8c93b',label:'Blonde',color:'#e8c93b'},{id:'c93305',label:'Red',color:'#c93305'},
    {id:'e8e1e1',label:'Gray',color:'#e8e1e1'},{id:'ecdcbf',label:'Platinum',color:'#ecdcbf'},
    {id:'3b82f6',label:'Blue',color:'#3b82f6'},{id:'ec4899',label:'Pink',color:'#ec4899'},
    {id:'a855f7',label:'Purple',color:'#a855f7'},{id:'22c55e',label:'Green',color:'#22c55e'},
];

const SKIN_TONES = [
    {id:'fddbb4',label:'Light',color:'#fddbb4'},{id:'edb98a',label:'Light Med',color:'#edb98a'},
    {id:'d08b5b',label:'Medium',color:'#d08b5b'},{id:'ae5d29',label:'Med Dark',color:'#ae5d29'},
    {id:'8d5524',label:'Dark',color:'#8d5524'},{id:'614335',label:'Deep',color:'#614335'},
];

const EYE_OPTIONS = [
    {id:'default',label:'Default'},{id:'happy',label:'Happy'},{id:'wink',label:'Wink'},
    {id:'hearts',label:'Hearts'},{id:'side',label:'Side Eye'},{id:'squint',label:'Squint'},
    {id:'surprised',label:'Surprised'},{id:'winkWacky',label:'Wacky Wink'},
    {id:'closed',label:'Closed'},{id:'cry',label:'Cry'},{id:'eyeRoll',label:'Eye Roll'},{id:'xDizzy',label:'X Dizzy'},
];

const EYEBROW_OPTIONS = [
    {id:'defaultNatural',label:'Natural'},{id:'flatNatural',label:'Flat'},
    {id:'raisedExcitedNatural',label:'Raised'},{id:'angryNatural',label:'Angry'},
    {id:'sadConcernedNatural',label:'Sad'},{id:'unibrowNatural',label:'Unibrow'},
    {id:'upDownNatural',label:'Up Down'},{id:'frownNatural',label:'Frown'},
];

const MOUTH_OPTIONS = [
    {id:'smile',label:'Smile'},{id:'twinkle',label:'Twinkle'},{id:'default',label:'Neutral'},
    {id:'serious',label:'Serious'},{id:'grimace',label:'Grimace'},{id:'sad',label:'Sad'},
    {id:'concerned',label:'Concerned'},{id:'disbelief',label:'Disbelief'},
    {id:'eating',label:'Eating'},{id:'tongue',label:'Tongue'},{id:'screamOpen',label:'Scream'},
];

const FACIAL_HAIR = [
    {id:'',label:'None'},{id:'beardLight',label:'Light Beard'},{id:'beardMedium',label:'Medium Beard'},
    {id:'beardMajestic',label:'Full Beard'},{id:'moustacheFancy',label:'Fancy Stache'},{id:'moustacheMagnum',label:'Magnum Stache'},
];

const ACCESSORIES_OPTIONS = [
    {id:'',label:'None'},{id:'sunglasses',label:'Sunglasses'},{id:'round',label:'Round Glasses'},
    {id:'prescription01',label:'Prescription'},{id:'prescription02',label:'Thick Frames'},
    {id:'wayfarers',label:'Wayfarers'},{id:'kurt',label:'Kurt Cobain'},{id:'eyepatch',label:'Eyepatch'},
];

const CLOTHING_OPTIONS = [
    {id:'hoodie',label:'Hoodie'},{id:'blazerAndShirt',label:'Blazer & Shirt'},
    {id:'blazerAndSweater',label:'Blazer & Sweater'},{id:'collarAndSweater',label:'Collar Sweater'},
    {id:'graphicShirt',label:'Graphic Tee'},{id:'shirtCrewNeck',label:'Crew Neck'},
    {id:'shirtScoopNeck',label:'Scoop Neck'},{id:'shirtVNeck',label:'V-Neck'},{id:'overall',label:'Overall'},
];

const CLOTHES_COLORS = [
    {id:'c41e3a',label:'OTJ Red',color:'#c41e3a'},{id:'1a1a2e',label:'Dark Navy',color:'#1a1a2e'},
    {id:'262626',label:'Black',color:'#262626'},{id:'f1f5f9',label:'White',color:'#f1f5f9'},
    {id:'3b82f6',label:'Blue',color:'#3b82f6'},{id:'22c55e',label:'Green',color:'#22c55e'},
    {id:'fbbf24',label:'Gold',color:'#fbbf24'},{id:'a855f7',label:'Purple',color:'#a855f7'},
    {id:'ec4899',label:'Pink',color:'#ec4899'},{id:'ef4444',label:'Red',color:'#ef4444'},
    {id:'f97316',label:'Orange',color:'#f97316'},{id:'06b6d4',label:'Teal',color:'#06b6d4'},
];

const OTJ_CHAINS = {
    none:{label:'None',price:0,free:true},gold_chain:{label:'Gold Chain',price:500},
    diamond:{label:'Diamond',price:800},otj_logo:{label:'OTJ Chain',price:1000},cuban:{label:'Cuban Link',price:700},
};

const CARD_BACKS = {
    classic:{label:'Classic Red',price:0,color:'#c41e3a',free:true},flame:{label:'Flame',price:300,color:'#ff6b35'},
    ice:{label:'Ice',price:300,color:'#60a5fa'},galaxy:{label:'Galaxy',price:500,color:'#7c3aed'},
    gold_foil:{label:'Gold Foil',price:800,color:'#fbbf24'},neon:{label:'Neon',price:400,color:'#22c55e'},
};

const DEFAULT_CONFIG = {
    top:'shortFlat',hairColor:'2c1b18',accessories:'',accessoriesColor:'1a1a2e',
    facialHair:'',facialHairColor:'2c1b18',clothing:'hoodie',clothesColor:'c41e3a',
    clothingGraphic:'',eyes:'default',eyebrows:'defaultNatural',mouth:'smile',
    skinColor:'d4a574',chain:'none',cardBack:'classic',
};

export function Avatar({ config = {}, size = 120, style = {} }) {
    const url = useMemo(() => buildAvatarUrl({ ...DEFAULT_CONFIG, ...config }, size * 2), [config, size]);
    return <div style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', ...style }}>
        <img src={url} alt="avatar" width={size} height={size} style={{ display: 'block' }} loading="lazy" />
    </div>;
}

export function AvatarMini({ config = {}, size = 36, style = {} }) {
    const url = useMemo(() => buildAvatarUrl({ ...DEFAULT_CONFIG, ...config, style: 'circle' }, size * 2), [config, size]);
    return <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)', ...style }}>
        <img src={url} alt="avatar" width={size} height={size} style={{ display: 'block' }} loading="lazy" />
    </div>;
}

export function AvatarCreator({ userId, currentConfig = {}, onSave, onClose }) {
    const [config, setConfig] = useState({ ...DEFAULT_CONFIG, ...currentConfig });
    const [tab, setTab] = useState('hair');
    const [saving, setSaving] = useState(false);
    const [bucks, setBucks] = useState(0);
    const F = "'JetBrains Mono','SF Mono',monospace";

    useEffect(() => { if (userId) loadBucks(); }, [userId]);
    async function loadBucks() {
        const { data } = await supabase.from('profiles').select('bucks_balance').eq('user_id', userId).single();
        if (data) setBucks(data.bucks_balance || 0);
    }
    async function handleSave() {
        setSaving(true);
        await supabase.from('profiles').update({ avatar_config: config }).eq('user_id', userId);
        setSaving(false);
        if (onSave) onSave(config);
    }
    const update = (k, v) => setConfig(p => ({ ...p, [k]: v }));
    const randomize = () => setConfig({
        ...DEFAULT_CONFIG,
        top: HAIR_STYLES[Math.floor(Math.random()*HAIR_STYLES.length)].id,
        hairColor: HAIR_COLORS[Math.floor(Math.random()*HAIR_COLORS.length)].id,
        skinColor: SKIN_TONES[Math.floor(Math.random()*SKIN_TONES.length)].id,
        eyes: EYE_OPTIONS[Math.floor(Math.random()*EYE_OPTIONS.length)].id,
        eyebrows: EYEBROW_OPTIONS[Math.floor(Math.random()*EYEBROW_OPTIONS.length)].id,
        mouth: MOUTH_OPTIONS[Math.floor(Math.random()*MOUTH_OPTIONS.length)].id,
        facialHair: Math.random()>0.6 ? FACIAL_HAIR[Math.floor(Math.random()*FACIAL_HAIR.length)].id : '',
        accessories: Math.random()>0.5 ? ACCESSORIES_OPTIONS[Math.floor(Math.random()*ACCESSORIES_OPTIONS.length)].id : '',
        clothing: CLOTHING_OPTIONS[Math.floor(Math.random()*CLOTHING_OPTIONS.length)].id,
        clothesColor: CLOTHES_COLORS[Math.floor(Math.random()*CLOTHES_COLORS.length)].id,
    });

    const avatarUrl = useMemo(() => buildAvatarUrl(config, 300), [config]);

    const TABS = [
        {id:'hair',label:'💇 Hair'},{id:'hairColor',label:'🎨 Hair Color'},{id:'skin',label:'👤 Skin'},
        {id:'eyes',label:'👁 Eyes'},{id:'eyebrows',label:'🤨 Brows'},{id:'mouth',label:'👄 Mouth'},
        {id:'facial',label:'🧔 Facial Hair'},{id:'glasses',label:'👓 Glasses'},{id:'clothes',label:'👕 Clothes'},
        {id:'clothesColor',label:'🎨 Outfit'},{id:'chain',label:'⛓ Chain'},{id:'cards',label:'🃏 Cards'},
    ];

    const isColor = ['skin','hairColor','clothesColor'].includes(tab);

    return <div style={{ background:'#0f0f1a',borderRadius:16,padding:20,border:'1px solid rgba(255,255,255,0.08)',maxWidth:520,width:'100%',fontFamily:F }}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,color:'#f1f5f9',letterSpacing:'0.08em'}}>AVATAR CREATOR</div>
            <div style={{fontSize:11,color:'#fbbf24',fontWeight:600}}>💰 {bucks.toLocaleString()} Bucks</div>
        </div>

        <div style={{display:'flex',justifyContent:'center',padding:16,background:'radial-gradient(circle at 50% 40%,rgba(196,30,58,0.06) 0%,transparent 60%)',borderRadius:12,marginBottom:16,border:'1px solid rgba(255,255,255,0.04)'}}>
            <img src={avatarUrl} alt="preview" width={150} height={150} style={{borderRadius:12}} />
        </div>

        <div style={{display:'flex',gap:4,marginBottom:14,overflowX:'auto',paddingBottom:4}}>
            {TABS.map(t => <button key={t.id} onClick={()=>setTab(t.id)} style={{
                padding:'5px 10px',borderRadius:6,border:'none',
                background:tab===t.id?'#c41e3a':'rgba(255,255,255,0.05)',
                color:tab===t.id?'white':'#64748b',fontSize:9,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',fontFamily:F,
            }}>{t.label}</button>)}
        </div>

        <div style={{display:'grid',gridTemplateColumns:isColor?'repeat(7,1fr)':'repeat(3,1fr)',gap:6,maxHeight:200,overflowY:'auto',padding:2}}>
            {tab==='hair' && HAIR_STYLES.map(h => <Btn key={h.id} label={h.label} sel={config.top===h.id} onClick={()=>update('top',h.id)} />)}
            {tab==='hairColor' && HAIR_COLORS.map(c => <Clr key={c.id} color={c.color} sel={config.hairColor===c.id} onClick={()=>update('hairColor',c.id)} />)}
            {tab==='skin' && SKIN_TONES.map(s => <Clr key={s.id} color={s.color} sel={config.skinColor===s.id} onClick={()=>update('skinColor',s.id)} />)}
            {tab==='eyes' && EYE_OPTIONS.map(e => <Btn key={e.id} label={e.label} sel={config.eyes===e.id} onClick={()=>update('eyes',e.id)} />)}
            {tab==='eyebrows' && EYEBROW_OPTIONS.map(e => <Btn key={e.id} label={e.label} sel={config.eyebrows===e.id} onClick={()=>update('eyebrows',e.id)} />)}
            {tab==='mouth' && MOUTH_OPTIONS.map(m => <Btn key={m.id} label={m.label} sel={config.mouth===m.id} onClick={()=>update('mouth',m.id)} />)}
            {tab==='facial' && FACIAL_HAIR.map(f => <Btn key={f.id} label={f.label} sel={config.facialHair===f.id} onClick={()=>update('facialHair',f.id)} />)}
            {tab==='glasses' && ACCESSORIES_OPTIONS.map(a => <Btn key={a.id} label={a.label} sel={config.accessories===a.id} onClick={()=>update('accessories',a.id)} />)}
            {tab==='clothes' && CLOTHING_OPTIONS.map(c => <Btn key={c.id} label={c.label} sel={config.clothing===c.id} onClick={()=>update('clothing',c.id)} />)}
            {tab==='clothesColor' && CLOTHES_COLORS.map(c => <Clr key={c.id} color={c.color} sel={config.clothesColor===c.id} onClick={()=>update('clothesColor',c.id)} />)}
            {tab==='chain' && Object.entries(OTJ_CHAINS).map(([k,v]) => <Btn key={k} label={v.label} sel={config.chain===k} price={v.free?0:v.price} onClick={()=>update('chain',k)} />)}
            {tab==='cards' && Object.entries(CARD_BACKS).map(([k,v]) => <div key={k} onClick={()=>update('cardBack',k)} style={{
                padding:10,borderRadius:8,cursor:'pointer',textAlign:'center',
                background:config.cardBack===k?'rgba(196,30,58,0.15)':'rgba(255,255,255,0.02)',
                border:config.cardBack===k?'2px solid #c41e3a':'2px solid rgba(255,255,255,0.06)',
            }}>
                <div style={{width:30,height:42,borderRadius:4,margin:'0 auto 6px',background:v.color,border:'2px solid rgba(255,255,255,0.15)'}} />
                <div style={{fontSize:9,fontWeight:600,color:config.cardBack===k?'#f1f5f9':'#94a3b8'}}>{v.label}</div>
                {!v.free && <div style={{fontSize:8,color:'#fbbf24',marginTop:2}}>💰 {v.price}</div>}
            </div>)}
        </div>

        <div style={{display:'flex',gap:8,marginTop:16}}>
            <button onClick={randomize} style={{padding:'10px 16px',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#94a3b8',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:F}}>🎲 RANDOM</button>
            <button onClick={handleSave} disabled={saving} style={{flex:1,padding:'10px 0',borderRadius:8,border:'none',background:'#c41e3a',color:'white',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:F,letterSpacing:'0.08em',opacity:saving?0.6:1}}>
                {saving?'SAVING...':'SAVE AVATAR'}
            </button>
            {onClose && <button onClick={onClose} style={{padding:'10px 16px',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#94a3b8',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:F}}>✕</button>}
        </div>
    </div>;
}

function Btn({label,sel,onClick,price}) {
    return <button onClick={onClick} style={{
        padding:'8px 4px',borderRadius:8,cursor:'pointer',textAlign:'center',
        background:sel?'rgba(196,30,58,0.15)':'rgba(255,255,255,0.02)',
        border:sel?'2px solid #c41e3a':'2px solid rgba(255,255,255,0.06)',fontFamily:"'JetBrains Mono',monospace",
    }}>
        <div style={{fontSize:9,fontWeight:600,color:sel?'#f1f5f9':'#94a3b8'}}>{label}</div>
        {price>0 && <div style={{fontSize:8,color:'#fbbf24',marginTop:2}}>💰 {price}</div>}
    </button>;
}

function Clr({color,sel,onClick}) {
    return <div onClick={onClick} style={{
        aspectRatio:'1',borderRadius:8,cursor:'pointer',background:color,minHeight:32,
        border:sel?'3px solid #c41e3a':'3px solid transparent',transition:'border 0.15s',
    }} />;
}

export { DEFAULT_CONFIG, HAIR_STYLES, HAIR_COLORS, SKIN_TONES, EYE_OPTIONS, EYEBROW_OPTIONS, MOUTH_OPTIONS, FACIAL_HAIR, ACCESSORIES_OPTIONS, CLOTHING_OPTIONS, CLOTHES_COLORS, OTJ_CHAINS, CARD_BACKS, buildAvatarUrl };
export default Avatar;
