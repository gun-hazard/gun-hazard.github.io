/**
 * Criador de Fichas D&D 5.5 - JavaScript
 * Dados (classes, especies, antecedentes, equipamento, magias, talentos)
 * sao carregados de web/data.js, gerado a partir dos JSON em data/.
 * Para expandir conteudo, edite data/*.json e rode: python tools/build_data.py
 */

// =============================================================================
// FONTE DE DADOS (window.DND_DATA)
// =============================================================================
if (!window.DND_DATA) {
    document.addEventListener('DOMContentLoaded', function() {
        alert('Dados nao encontrados.\nExecute "python tools/build_data.py" para gerar web/data.js.');
    });
    throw new Error('DND_DATA ausente');
}

const DATA = window.DND_DATA;
const CORE = DATA.core || {};

const ATTRIBUTES = CORE.attributes || ["for", "des", "con", "int", "sab", "car"];
const ATTR_NAMES = CORE.attrNames || {};
const SKILLS = CORE.skills || {};
const ALIGNMENTS = CORE.alignments || [];
const COMMON_LANGUAGES = CORE.commonLanguages || [];
const RARE_LANGUAGES = CORE.rareLanguages || [];
const PROFICIENCY_BONUS = CORE.proficiencyBonus || {};
const XP_TABLE = CORE.xpTable || {};
const DEFAULT_ARRAY = CORE.defaultArray || [15, 14, 13, 12, 10, 8];
const POINT_COSTS = CORE.pointCosts || {};
const MAX_POINTS = CORE.maxPoints || 27;

const CLASSES = DATA.classes || {};
const SPECIES = DATA.species || {};
const BACKGROUNDS = DATA.backgrounds || {};
const EQUIPMENT = DATA.equipment || {};
const WEAPONS = EQUIPMENT.weapons || {};
const ARMORS = EQUIPMENT.armors || {};
const ITEMS = EQUIPMENT.items || {};
const SHIELD = EQUIPMENT.shield || { caBonus: 2 };
const SPELLS = (DATA.spells && DATA.spells.spells) || [];
const FEATS = DATA.feats || {};

// =============================================================================
// ESTADO DO PERSONAGEM
// =============================================================================
let state = {
    method: 'standard',
    attrValues: {},          // valor atribuido via Conjunto Padrao/4d6 (attr -> score)
    standardPool: [...DEFAULT_ARRAY],
    rollValues: [],
    bonusAttrs: [],          // ordem de escolha dos atributos com bônus de antecedente (max 3)
    classEquipSel: [],       // por grupo escolhido: lista de itens (strings)
    bgEquipSel: [],          // por grupo escolhido do antecedente: lista de itens
    extraEquipment: [],      // itens adicionados individualmente
    equipped: [],            // itens marcados como equipados (nomes base do catalogo)
    feats: [],               // talentos extras selecionados (nomes do catalogo)
    originSwap: false,       // regra caseira: trocar talento de origem
    originFeat: '',          // escolha manual do talento de origem (vazio = usar o da antecedente)
    extraAllowed: false,     // regra caseira: permitir talentos extras
    freeSkills: false,       // regra caseira: escolher perícias livremente
    languagesChosen: [],     // 2 idiomas escolhidos (alem do Comum)
    spells: { cantrips: [], lvl1: [], lvl2: [], lvl3: [], lvl4: [], lvl5: [], lvl6: [], lvl7: [], lvl8: [], lvl9: [] },
    spellAttackCards: {},   // cards de ataque opt-in por magia: nome -> {enabled + 11 campos}
    attackObs: {},          // OBS dos cards de ataque de armas: nome -> texto
    prevBackground: '',     // antecedente anterior (p/ limpar perícias órfãs na troca)
    subclass: {},           // subclasse por classe: { classKey: subName }
    mc: { enabled: false, class2: '', level2: 1 },
    asi: [],                // [{ cls, level, epic, kind: 'attr'|'feat', attr, feat }]
    tokenImg: '',           // dataURL da imagem do Token (passo 1)
    fullBodyImg: ''         // dataURL da imagem de corpo inteiro (resumo)
};

let character = {
    name: "", level: 1, className: "", classLevel: 1, class2: "", level2: 0, mcEnabled: false,
    subclass: {}, asi: [], species: "", background: "", alignment: "Neutro",
    attributes: {},                   // finais (com bonus)
    baseAttributes: {},               // valor puro por atributo
    attributeMethod: 'standard',
    skillsProf: [], bgSkills: [],
    armor: "Nenhuma", weapons: [], weapon: "", hasShield: false,
    languages: ["Comum"],
    equipment: [],
    inventory: [],
    classEquipSel: [],
    bgEquipSel: [],
    extraEquipment: [],
    feats: [], featsHomebrew: "",
    originSwap: false, originFeat: "", extraAllowed: false,
    freeSkills: false,
    languages: ["Comum"],
    spells: { cantrips: [], lvl1: [], lvl2: [], lvl3: [], lvl4: [], lvl5: [], lvl6: [], lvl7: [], lvl8: [], lvl9: [] },
    spellAttackCards: {},
    attackObs: {},
    tokenImg: '', fullBodyImg: '',
    personality: "", ideals: "", bonds: "", flaws: "", notes: ""
};

// =============================================================================
// FUNÇÕES AUXILIARES
// =============================================================================
function calcModifier(value) { return Math.floor((value - 10) / 2); }
function formatModifier(mod) { return mod >= 0 ? `+${mod}` : `${mod}`; }

function getProficiencyBonus(level) { return PROFICIENCY_BONUS[level] || 2; }

function arraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
}

function calculateAC(armorName, dexMod, hasShield) {
    const armor = ARMORS[armorName] || ARMORS["Nenhuma"];
    let ca;
    if (armor.caBase !== undefined) {
        if (armor.dexBonus) {
            const effectiveDex = armor.maxDex != null ? Math.min(dexMod, armor.maxDex) : dexMod;
            ca = armor.caBase + effectiveDex;
        } else {
            ca = armor.caBase;
        }
    } else {
        ca = 10 + dexMod;
    }
    if (hasShield && EQUIPMENT.shield) ca += EQUIPMENT.shield.caBonus;
    return ca;
}

function calculatePassivePerception(wisMod, profBonus, hasProficiency) {
    return 10 + wisMod + (hasProficiency ? profBonus : 0);
}

function getSpellsPreparedMax(classData, castingMod, level) {
    if (!classData || !classData.castingStat) return 0;
    const arr = classData.preparedPerLevel;
    if (Array.isArray(arr) && arr.length) return arr[Math.min(Math.max(level, 1) - 1, arr.length - 1)] || 0;
    return Math.max(1, castingMod) + level;
}

function getCantripsKnown(classData, level) {
    const arr = classData.cantripsPerLevel;
    if (Array.isArray(arr) && arr.length) return arr[Math.min(Math.max(level, 1) - 1, arr.length - 1)] || 0;
    return classData.cantrips || 0;
}

const CIRCLE_MIN_LEVEL = { 1: 1, 2: 3, 3: 5, 4: 7, 5: 9, 6: 11, 7: 13, 8: 15, 9: 17 };

// Tabelas de espaços de magia por nível (índice 0 = nível 1; arrays por círculo 1..9)
const FULL_SLOTS = [
    [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2],
    [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
    [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]
];
const HALF_SLOTS = [
    [2], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
    [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2],
    [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2]
];
const PACT_SLOTS = [
    { n: 1, lvl: 1 }, { n: 2, lvl: 1 }, { n: 2, lvl: 2 }, { n: 2, lvl: 2 },
    { n: 2, lvl: 3 }, { n: 2, lvl: 3 }, { n: 2, lvl: 4 }, { n: 2, lvl: 4 },
    { n: 2, lvl: 5 }, { n: 2, lvl: 5 }, { n: 3, lvl: 5 }, { n: 3, lvl: 5 },
    { n: 3, lvl: 5 }, { n: 3, lvl: 5 }, { n: 3, lvl: 5 }, { n: 3, lvl: 5 },
    { n: 4, lvl: 5 }, { n: 4, lvl: 5 }, { n: 4, lvl: 5 }, { n: 4, lvl: 5 }
];
const FULL_CASTERS = ['bardo', 'clerigo', 'druida', 'feiticeiro', 'mago'];
const HALF_CASTERS = ['paladino', 'guardiao'];
const PACT_CASTERS = ['bruxo'];

function getCasterProgression(classKey) {
    if (FULL_CASTERS.includes(classKey)) return 'full';
    if (HALF_CASTERS.includes(classKey)) return 'half';
    if (PACT_CASTERS.includes(classKey)) return 'pact';
    return 'none';
}

// Retorna { slots: {1:n..9:m}, pact: null | { n, lvl } } para classe/nível (suporta MC via getEffectiveCasterInfo)
function getSpellSlots(classKey, level) {
    const prog = getCasterProgression(classKey);
    const lvl = Math.min(Math.max(level || 1, 1), 20);
    const table = prog === 'full' ? FULL_SLOTS : prog === 'half' ? HALF_SLOTS : null;
    const slots = {};
    for (let k = 1; k <= 9; k++) slots[k] = 0;
    if (table) {
        table[lvl - 1].forEach((n, i) => { slots[i + 1] = n; });
        return { slots, pact: null };
    }
    if (prog === 'pact') {
        const p = PACT_SLOTS[lvl - 1];
        return { slots, pact: { n: p.n, lvl: p.lvl } };
    }
    return { slots, pact: null };
}

// =============================================================================
// INICIALIZAÇÃO
// =============================================================================
document.addEventListener('DOMContentLoaded', function() {
    state.attrValues = {};
    ATTRIBUTES.forEach(a => { state.attrValues[a] = null; });

    initializeSelects();
    renderAttributes();
    initializeSkillsGrid();
    renderEquipmentChoices();
    document.getElementById('featsStep').style.display = 'block';
    populateLanguages();
    renderFeats();
    initializeEventListeners();
    syncBasicsFromSelects();
    updateAllCalculations();
    resetHistory();
});

function initializeSelects() {
    const classSelect = document.getElementById('charClass');
    const classSelect2 = document.getElementById('charClass2');
    Object.keys(CLASSES).forEach(key => {
        const o = document.createElement('option'); o.value = key; o.textContent = CLASSES[key].name || key;
        classSelect.appendChild(o);
        const o2 = document.createElement('option'); o2.value = key; o2.textContent = CLASSES[key].name || key;
        if (classSelect2) classSelect2.appendChild(o2);
    });

    const speciesSelect = document.getElementById('charSpecies');
    Object.keys(SPECIES).forEach(name => {
        const o = document.createElement('option'); o.value = name; o.textContent = name;
        speciesSelect.appendChild(o);
    });

    const bgSelect = document.getElementById('charBackground');
    Object.keys(BACKGROUNDS).forEach(name => {
        const o = document.createElement('option'); o.value = name; o.textContent = name;
        bgSelect.appendChild(o);
    });

    // Itens (fontes para adicionar individualmente)
    const itemSelect = document.getElementById('itemSelect');
    [
        ['-- Armas --', null],
        ...Object.keys(WEAPONS).map(n => [n, `${n} (${WEAPONS[n].damage} · ${WEAPONS[n].cost})`]),
        ['-- Armaduras e Escudo --', null],
        ...Object.keys(ARMORS).filter(n => n !== 'Nenhuma').map(n => [n, `${n} (${ARMORS[n].cost})`]),
        ['-- Escudo --', null],
        ['Escudo', 'Escudo (+2 CA)'],
        ['-- Ferramentas e Itens Diversos --', null],
        ...Object.keys(ITEMS).map(n => [n, `${n} (${ITEMS[n].cost || ''})`])
    ].forEach(([val, label]) => {
        if (val === null) {
            const o = document.createElement('option');
            o.disabled = true; o.textContent = label;
            itemSelect.appendChild(o);
        } else {
            const o = document.createElement('option'); o.value = val; o.textContent = label;
            itemSelect.appendChild(o);
        }
    });
}

// =============================================================================
// ATRIBUTOS (métodos de geração)
// =============================================================================
function renderAttributes() {
    const method = document.getElementById('attrMethod').value;
    state.method = method;
    const grid = document.getElementById('attributesGrid');
    grid.innerHTML = '';
    state.attrValues = {};
    ATTRIBUTES.forEach(a => { state.attrValues[a] = null; });

    if (method === 'standard') {
        state.standardPool = [...DEFAULT_ARRAY];
        ATTRIBUTES.forEach(attr => buildAttrSelectCard(grid, attr));
    } else if (method === 'roll') {
        state.rollValues = rollScores();
        ATTRIBUTES.forEach(attr => buildAttrSelectCard(grid, attr));
    } else {
        ATTRIBUTES.forEach(attr => buildAttrInputCard(grid, attr));
    }

    renderAttrBonusButtons();

    const rollBtn = document.getElementById('rollBtn');
    const pointsDisplay = document.getElementById('pointsLeft');
    rollBtn.style.display = method === 'roll' ? 'inline-block' : 'none';
    pointsDisplay.style.display = 'inline';
    pointsDisplay.textContent = method === 'pointbuy' ? `Pontos: ${MAX_POINTS}/${MAX_POINTS}` : (method === 'standard' ? 'Conjunto Padrao' : '4d6 (remover menor)');
    pointsDisplay.className = 'points-badge';
}

function getPoolFor(attr) {
    if (!state.attrValues || state.attrValues[attr] === null) return null;
    return state.attrValues[attr];
}

function buildAttrSelectCard(grid, attr) {
    const card = document.createElement('div');
    card.className = 'attr-card';
    card.innerHTML = `
        <div class="attr-name">${ATTR_NAMES[attr]}</div>
        <select data-attr="${attr}"></select>
        <div class="attr-final" id="final-${attr}">—</div>
        <div class="attr-mod" id="mod-${attr}">+0</div>
    `;
    grid.appendChild(card);
    refreshAttrSelectOptions(attr);
}

function refreshAttrSelectOptions(changedAttr) {
    const pool = state.method === 'standard' ? state.standardPool : state.rollValues;
    const enforceUnique = state.method === 'standard';
    ATTRIBUTES.forEach(attr => {
        const sel = document.querySelector(`#attributesGrid select[data-attr="${attr}"]`);
        if (!sel) return;
        const current = state.attrValues[attr];
        let taken = new Set();
        if (enforceUnique) {
            const usedElsewhere = ATTRIBUTES.filter(a => a !== attr && state.attrValues[a] != null);
            taken = new Set(usedElsewhere.map(a => state.attrValues[a]));
        }
        sel.innerHTML = '';
        const empty = document.createElement('option');
        empty.value = ''; empty.textContent = '--';
        sel.appendChild(empty);
        pool.forEach(v => {
            if (enforceUnique && taken.has(v)) return;
            const o = document.createElement('option');
            o.value = v; o.textContent = v;
            sel.appendChild(o);
        });
        if (current != null) sel.value = String(current);
    });
    void changedAttr;
}

function buildAttrInputCard(grid, attr) {
    const card = document.createElement('div');
    card.className = 'attr-card';
    card.innerHTML = `
        <div class="attr-name">${ATTR_NAMES[attr]}</div>
        <input type="number" id="attr-${attr}" data-attr="${attr}" min="8" max="15" value="8">
        <div class="attr-final" id="final-${attr}">8</div>
        <div class="attr-mod" id="mod-${attr}">+0</div>
    `;
    grid.appendChild(card);
}

function rollScores() {
    const scores = [];
    for (let i = 0; i < 6; i++) {
        const dice = [1, 2, 3, 4].map(() => Math.floor(Math.random() * 6) + 1);
        dice.sort((a, b) => b - a);
        scores.push(dice[0] + dice[1] + dice[2]);
    }
    return scores.sort((a, b) => b - a);
}

function handleAttrSelectChange(attr) {
    const sel = document.querySelector(`#attributesGrid select[data-attr="${attr}"]`);
    const val = sel ? Number(sel.value) : null;
    if (isNaN(val)) {
        state.attrValues[attr] = null;
        refreshAttrSelectOptions(attr);
    } else {
        state.attrValues[attr] = val;
        // Conjunto Padrao: remover de qualquer outro atributo que tenha o mesmo valor;
        // nos dados rolados os valores podem se repetir entre atributos
        if (state.method === 'standard') {
            ATTRIBUTES.forEach(a => {
                if (a !== attr && state.attrValues[a] === val) {
                    state.attrValues[a] = null;
                    const otherSel = document.querySelector(`#attributesGrid select[data-attr="${a}"]`);
                    if (otherSel) otherSel.value = '';
                }
            });
        }
        refreshAttrSelectOptions(attr);
    }
    updateAllCalculations();
}

// =============================================================================
// AJUSTES DE ANTECEDENTE (+2 / +1 / +1)
// =============================================================================
function renderAttrBonusButtons() {
    const bonusesDiv = document.getElementById('attrBonuses');
    bonusesDiv.innerHTML = '';
    ATTRIBUTES.forEach(attr => {
        const btn = document.createElement('button');
        btn.className = 'bonus-btn';
        btn.dataset.attr = attr;
        btn.textContent = ATTR_NAMES[attr];
        btn.onclick = () => handleBonusClick(attr);
        bonusesDiv.appendChild(btn);
    });
    updateBonusButtons();
}

function handleBonusClick(attr) {
    const list = (state.bonusAttrs || []).slice();
    const idx = list.indexOf(attr);
    if (idx >= 0) {
        list.splice(idx, 1);
    } else {
        if (list.length >= 3) list.shift();
        list.push(attr);
    }
    state.bonusAttrs = list;
    updateBonusButtons();
    updateAllCalculations();
}

function bonusForAttr(attr) {
    const list = state.bonusAttrs || [];
    const idx = list.indexOf(attr);
    if (idx < 0) return 0;
    if (list.length === 3) return 1;
    return idx === 0 ? 2 : 1;
}

function updateBonusButtons() {
    const list = state.bonusAttrs || [];
    document.querySelectorAll('.bonus-btn').forEach(btn => {
        const attr = btn.dataset.attr;
        btn.classList.remove('active');
        btn.textContent = ATTR_NAMES[attr];
        const idx = list.indexOf(attr);
        if (idx >= 0) {
            const bonus = list.length === 3 ? 1 : (idx === 0 ? 2 : 1);
            btn.textContent += ` (+${bonus})`;
            btn.classList.add('active');
        }
    });
}

function getBaseAttr(attr) {
    const sel = document.querySelector(`#attributesGrid select[data-attr="${attr}"]`);
    if (sel) {
        if (state.attrValues[attr] != null) return state.attrValues[attr];
        return null;
    }
    const input = document.querySelector(`#attributesGrid input[data-attr="${attr}"]`);
    if (input) return parseInt(input.value) || 8;
    return 8;
}

function getFinalAttributes() {
    const final = {};
    ATTRIBUTES.forEach(attr => {
        let base = getBaseAttr(attr);
        if (base == null) base = 8;
        final[attr] = Math.min(base + bonusForAttr(attr) + asiBonusForAttr(attr), 20);
    });
    return final;
}

// =============================================================================
// PERÍCIAS (classe + antecedente)
// =============================================================================
function initializeSkillsGrid() {
    const grid = document.getElementById('skillsGrid');
    Object.keys(SKILLS).forEach(skill => {
        const item = document.createElement('div');
        item.className = 'skill-row';
        item.dataset.skill = skill;
        item.innerHTML = `
            <input type="checkbox" id="skill-${cssId(skill)}" data-skill="${skill}">
            <label for="skill-${cssId(skill)}">${skill}</label>
            <span class="skill-attr">(${SKILLS[skill].attr.toUpperCase()})</span>
            <span class="skill-source" data-source=""></span>
            <span class="skill-mod" id="skill-mod-${cssId(skill)}">+0</span>
        `;
        grid.appendChild(item);
    });
}

function cssId(str) {
    return str.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '');
}

function getSelectedSkills() {
    const list = [];
    document.querySelectorAll('#skillsGrid input[type="checkbox"]:checked').forEach(cb => {
        list.push(cb.dataset.skill);
    });
    return list;
}

// fontes de perícia livre concedidas pela espécie (derivadas dos traços do livro)
function speciesSkillSources(speciesName) {
    const sp = SPECIES[speciesName];
    const out = [];
    if (!sp || !Array.isArray(sp.traits)) return out;
    sp.traits.forEach(t => {
        const desc = (t.desc || '') + ' ' + (t.name || '');
        const rna = desc.match(/proficiência na perícia ([^.\n]+)/);
        if (rna) {
            const allowed = rna[1].split(/,\s*|\s+ou\s+/).map(s => s.trim()).filter(Boolean);
            if (allowed.length) out.push({ allowed: allowed, count: 1, note: t.name || 'Espécie' });
            return;
        }
        if (/proficiência em uma perícia/.test(desc)) {
            out.push({ allowed: null, count: 1, note: t.name || 'Espécie' });
        }
    });
    return out;
}

function speciesFreeMax(speciesName) {
    return speciesSkillSources(speciesName).reduce((a, s) => a + s.count, 0);
}

function speciesSkillAllowed(speciesName, skill) {
    return speciesSkillSources(speciesName).some(s => s.allowed === null || s.allowed.includes(skill));
}

function updateSkillsAvailability() {
    const classData = CLASSES[document.getElementById('charClass').value];
    const bgData = BACKGROUNDS[document.getElementById('charBackground').value];
    const speciesName = document.getElementById('charSpecies').value;
    const classOpts = [];
    getClassLevels().forEach(({ data }) => {
        (data.skillOptions || []).forEach(s => { if (!classOpts.includes(s)) classOpts.push(s); });
    });
    const bgSkills = (bgData && bgData.skills) ? bgData.skills : [];
    const sources = speciesSkillSources(speciesName);
    const freeAllowed = new Set();
    let anyFree = false;
    sources.forEach(s => { if (s.allowed) s.allowed.forEach(k => freeAllowed.add(k)); else anyFree = true; });
    const freeMax = sources.reduce((a, s) => a + s.count, 0);
    const homebrew = state.freeSkills;
    const valid = new Set([...bgSkills, ...classOpts]);

    // Remover marcacoes fora de bg/classe sem permissao da especie (e sem homebrew)
    if (classData && !homebrew) {
        document.querySelectorAll('#skillsGrid input[type="checkbox"]:checked').forEach(cb => {
            if (!valid.has(cb.dataset.skill)) {
                if (!(anyFree || freeAllowed.has(cb.dataset.skill))) cb.checked = false;
            }
        });
    }

    let checkedFree = 0;
    document.querySelectorAll('#skillsGrid .skill-row').forEach(row => {
        const skill = row.dataset.skill;
        const cb = row.querySelector('input[type="checkbox"]');
        const isBg = bgSkills.includes(skill);
        const isClassOpt = classOpts.includes(skill) || !classData;
        const freeEligible = homebrew || anyFree || freeAllowed.has(skill);
        if (cb.checked && !isBg && !isClassOpt && freeEligible) checkedFree += 1;
    });

    document.querySelectorAll('#skillsGrid .skill-row').forEach(row => {
        const skill = row.dataset.skill;
        const cb = row.querySelector('input[type="checkbox"]');
        const source = row.querySelector('.skill-source');
        const isBg = bgSkills.includes(skill);
        const isClassOpt = classOpts.includes(skill) || !classData;
        const freeEligible = anyFree || freeAllowed.has(skill);
        let enabled;
        if (isBg || isClassOpt) {
            enabled = true;
        } else if (cb.checked) {
            enabled = true; // permite desmarcar
        } else if (homebrew) {
            enabled = true;
        } else {
            enabled = freeEligible && checkedFree < freeMax;
        }
        cb.disabled = !enabled;
        row.classList.toggle('locked', isBg);
        if (isBg) {
            cb.checked = true;
            source.textContent = 'BG';
            const bgName = document.getElementById('charBackground').value;
            source.title = bgName ? `Do antecedente ${bgName}` : '';
        } else {
            source.textContent = '';
            source.title = '';
        }
    });

    updateSkillsCounter();
    updateAllCalculations();
}

function updateSkillsCounter() {
    const classData = CLASSES[document.getElementById('charClass').value];
    const bgData = BACKGROUNDS[document.getElementById('charBackground').value];
    const bgSkills = (bgData && bgData.skills) || [];
    const speciesName = document.getElementById('charSpecies').value;
    const sources = speciesSkillSources(speciesName);
    const homebrew = state.freeSkills;
    if (!classData) {
        document.getElementById('skillsHint').textContent = 'Selecione as pericias da sua classe e antecedente';
        return;
    }
    const classOpts = classData.skillOptions || [];
    const checkedClass = getSelectedSkills().filter(s => classOpts.includes(s) && !bgSkills.includes(s));
    const remaining = Math.max(0, classData.skillsCount - checkedClass.length);
    let msg = `Selecione ate ${classData.skillsCount} pericias da sua classe. Restantes: ${remaining} (pericias do antecedente ja estao marcadas).`;
    if (sources.length) {
        const freeTot = sources.reduce((a, s) => a + s.count, 0);
        const freeUsed = getSelectedSkills().filter(s => !classOpts.includes(s) && !bgSkills.includes(s)).length;
        msg += ` Sua especie concede ${freeUsed}/${freeTot} pericias livres (${sources.map(s => s.note).join(', ')}).`;
    }
    if (homebrew) msg += ' REGRA CASEIRA ATIVA: qualquer pericie pode ser escolhida.';
    document.getElementById('skillsHint').textContent = msg;
}

// =============================================================================
// DETALHES (Classe / Especie / Antecedente)
// =============================================================================
function updateClassInfo() {
    const name = document.getElementById('charClass').value;
    const classData = CLASSES[name];
    document.getElementById('classDesc').textContent = classData ? classData.description : '';
    document.getElementById('classEquipBox').style.display = classData ? 'block' : 'none';

    document.getElementById('classMeta').textContent = '';
    if (classData) {
        renderClassFeatures();
        const st = classData.savingThrows || [];
        document.getElementById('classMeta').textContent =
            `${classData.hitDice} PV, salvaguardas: ${st.map(a => ATTR_NAMES[a]).join(', ') || '-'}, proficiencias: ${(classData.armorProficiencies || []).join(', ') || 'nenhuma'}`;
    }
    renderEquipmentChoices();
    renderSpells();
    refreshSubclasses();
    refreshMulticlassBox();
    renderASI();
    updateSkillsAvailability();
    updateAllCalculations();
}

function hitDieSize(classData) {
    const m = String((classData && (classData.hd || classData.hitDice)) || '').match(/d(\d+)/);
    if (m) return parseInt(m[1], 10);
    return (classData && classData.hpLevel1) || 8;
}
function hitDieAvg(classData) { return Math.floor(hitDieSize(classData) / 2) + 1; }

// classLevels: [{ data, level }] em ordem (a primeira entrada contém o nível 1 do personagem)
function calculateMaxHP(classLevels, conMod) {
    let hp = 0, first = true;
    (classLevels || []).forEach(({ data, level }) => {
        for (let i = 0; i < (level || 0); i++) {
            if (first && i === 0) hp += ((data && (data.hpLevel1 || hitDieSize(data))) || 8) + conMod;
            else hp += Math.max(1, hitDieAvg(data) + conMod);
            first = false;
        }
    });
    return hp;
}

function getCurrentLevel() {
    return parseInt(document.getElementById('charLevel').value, 10) || 1;
}

function getFeaturesUpToLevel(classData, level) {
    return ((classData && classData.features) || [])
        .filter(f => (f.level == null ? 0 : f.level) <= level)
        .sort((a, b) => a.level - b.level);
}

function renderClassFeatures() {
    const featEl = document.getElementById('classFeatures');
    if (!featEl) return;
    featEl.innerHTML = '';
    const classData = CLASSES[document.getElementById('charClass').value];
    if (!classData) return;
    getFeaturesUpToLevel(classData, getCurrentLevel()).forEach(f => {
        const div = document.createElement('div');
        div.className = 'detail-item';
        const strong = document.createElement('strong');
        strong.textContent = f.name;
        div.appendChild(strong);
        const span = document.createElement('span');
        span.className = 'detail-sub';
        span.textContent = f.desc;
        div.appendChild(span);
        if (f.level != null) {
            const tag = document.createElement('span');
            tag.className = 'feature-level';
            tag.textContent = `Nível ${f.level}`;
            div.appendChild(tag);
        }
        featEl.appendChild(div);
    });
}

function populateSubraceOptions(name) {
    const group = document.getElementById('subraceGroup');
    const sel = document.getElementById('charSubrace');
    const subs = (SPECIES[name] && SPECIES[name].subraces) || [];
    sel.innerHTML = '';
    if (!subs.length) {
        group.style.display = 'none';
        return;
    }
    subs.forEach(s => {
        const o = document.createElement('option');
        o.value = s.name; o.textContent = s.name;
        sel.appendChild(o);
    });
    if (!sel.value || !subs.some(s => s.name === sel.value)) sel.value = subs[0].name;
    group.style.display = 'block';
}

function getChosenSubrace() {
    const sel = document.getElementById('charSubrace');
    return (sel && sel.value) ? sel.value : '';
}

function speciesTraitsFor(speciesName, subrace) {
    const sp = SPECIES[speciesName];
    if (!sp) return [];
    const traits = (sp.traits || []).filter(t => t.desc);
    const subs = sp.subraces || [];
    if (!subs.length) return traits;
    const chosen = subs.find(s => s.name === subrace) || subs[0];
    if (!chosen) return traits;
    const linhagemNames = { 'Elfo': 'Linhagem Élfica', 'Tiferino': 'Legado Ínfero' }[speciesName];
    const filtered = linhagemNames ? traits.filter(t => t.name !== linhagemNames) : traits;
    return filtered.concat([{ name: chosen.name, desc: chosen.desc }]);
}

function renderSpeciesTraits() {
    const name = document.getElementById('charSpecies').value;
    const traitEl = document.getElementById('speciesTraits');
    traitEl.innerHTML = '';
    speciesTraitsFor(name, getChosenSubrace()).forEach(t => {
        const div = document.createElement('div');
        div.className = 'detail-item';
        div.innerHTML = `<strong>${t.name}</strong> <span class="detail-sub">${t.desc}</span>`;
        traitEl.appendChild(div);
    });
}

function updateSpeciesInfo() {
    const name = document.getElementById('charSpecies').value;
    const species = SPECIES[name];
    document.getElementById('speciesDesc').textContent = species ? species.description : '';
    document.getElementById('speciesMeta').textContent = '';
    if (species) {
        const langs = 'Comum + 2 à escolha';
        document.getElementById('speciesMeta').textContent =
            `${species.size}, deslocamento ${species.speed}m, visao no escuro ${species.darkvision}m, idiomas: ${langs}`;
    }
    populateSubraceOptions(name);
    renderSpeciesTraits();
    updateSkillsAvailability();
    updateAllCalculations();
}

function updateBackgroundInfo() {
    const name = document.getElementById('charBackground').value;
    const bg = BACKGROUNDS[name];
    document.getElementById('bgDesc').textContent = bg ? bg.description : '';
    const showBg = bg && (bg.equipment || (bg.equipmentChoices && bg.equipmentChoices.length));
    document.getElementById('bgEquipBox').style.display = showBg ? 'block' : 'none';
    renderBgEquipmentChoices();

    const detailEl = document.getElementById('bgDetails');
    detailEl.innerHTML = '';
    if (bg) {
        if (bg.feat) {
            const div = document.createElement('div');
            div.className = 'detail-item';
            const featName = bg.feat.replace(/ \(.*\)$/, '');
            const featDesc = FEATS[featName] ? FEATS[featName].desc : (FEATS[bg.feat] ? FEATS[bg.feat].desc : '');
            div.innerHTML = `<strong>Talento: ${bg.feat}</strong>${featDesc ? ` <span class="detail-sub">${featDesc}</span>` : ''}`;
            detailEl.appendChild(div);
        }
        if (bg.languages) {
            const div = document.createElement('div');
            div.className = 'detail-item';
            div.innerHTML = `<strong>Idiomas:</strong> <span class="detail-sub">${bg.languages}</span>`;
            detailEl.appendChild(div);
        }
        if (bg.skills && bg.skills.length) {
            const div = document.createElement('div');
            div.className = 'detail-item';
            div.innerHTML = `<strong>Pericias:</strong> <span class="detail-sub">${bg.skills.join(', ')}</span>`;
            detailEl.appendChild(div);
        }
        if (bg.tool) {
            const div = document.createElement('div');
            div.className = 'detail-item';
            div.innerHTML = `<strong>Ferramenta:</strong> <span class="detail-sub">${bg.tool}</span>`;
            detailEl.appendChild(div);
        }
    }
    renderOriginFeatCard();
    updateSkillsAvailability();
    updateAllCalculations();
}

// =============================================================================
// SUBCLASSE / MULTICLASSE / MELHORIA DE ATRIBUTO (níveis avançados)
// =============================================================================

// ---- Níveis por classe (ordem: primária primeiro = nível 1 do personagem) ----
function getClassLevels() {
    const out = [];
    const c1 = document.getElementById('charClass').value;
    if (c1 && CLASSES[c1]) out.push({ key: c1, data: CLASSES[c1], level: getCurrentLevel() });
    if (state.mc && state.mc.enabled && state.mc.class2 && CLASSES[state.mc.class2] && state.mc.class2 !== c1) {
        out.push({ key: state.mc.class2, data: CLASSES[state.mc.class2], level: Math.max(1, state.mc.level2 || 1) });
    }
    return out;
}
function getTotalLevel() {
    return getClassLevels().reduce((a, c) => a + c.level, 0);
}
function classLevelOf(classKey) {
    const e = getClassLevels().find(c => c.key === classKey);
    return e ? e.level : 0;
}
function classesLabel() {
    const parts = getClassLevels().map(e => `${e.data.name || e.key} ${e.level}`);
    return parts.length ? parts.join(' / ') : '-';
}

// ---- Subclasse ----
function getSubclassesOf(classKey) {
    const cd = CLASSES[classKey];
    return (cd && cd.subclasses) || [];
}
function getChosenSubclass(classKey) {
    const subs = getSubclassesOf(classKey);
    if (!subs.length) return '';
    const chosen = (state.subclass || {})[classKey];
    if (chosen && subs.some(s => s.name === chosen)) return chosen;
    return subs[0].name;
}
function populateSubclassOptions(classKey, selId, groupId) {
    const sel = document.getElementById(selId);
    const group = document.getElementById(groupId);
    if (!sel || !group) return;
    const subs = getSubclassesOf(classKey);
    const cd = CLASSES[classKey];
    const lvl = classLevelOf(classKey);
    sel.innerHTML = '';
    if (!subs.length || !cd || lvl < (cd.subclassLevel || 99)) { group.style.display = 'none'; return; }
    subs.forEach(s => {
        const o = document.createElement('option');
        o.value = s.name; o.textContent = s.name;
        sel.appendChild(o);
    });
    sel.value = getChosenSubclass(classKey);
    group.style.display = 'block';
}
// Divide "### Nível N: ..." em [{ level, title, text }]
function parseSubclassSections(sub) {
    const desc = (sub && sub.desc) || '';
    const parts = desc.split(/###\s*Nível\s*(\d+)\s*:?/);
    const out = [];
    if (parts[0] && parts[0].trim()) out.push({ level: 0, title: sub.name, text: parts[0].trim() });
    for (let i = 1; i + 1 < parts.length; i += 2) {
        out.push({ level: parseInt(parts[i], 10) || 0, title: `${sub.name} — Nível ${parts[i]}`, text: (parts[i + 1] || '').trim() });
    }
    if (!out.length && desc.trim()) out.push({ level: 0, title: sub.name, text: desc.trim() });
    return out;
}
function appendFeatureItem(container, title, text, level) {
    const div = document.createElement('div');
    div.className = 'detail-item';
    const strong = document.createElement('strong');
    strong.textContent = title;
    div.appendChild(strong);
    const span = document.createElement('span');
    span.className = 'detail-sub';
    span.textContent = text;
    div.appendChild(span);
    if (level != null && level > 0) {
        const tag = document.createElement('span');
        tag.className = 'feature-level';
        tag.textContent = `Nível ${level}`;
        div.appendChild(tag);
    }
    container.appendChild(div);
}
function renderSubclassInto(containerId, classKey) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    const sub = getSubclassesOf(classKey).find(s => s.name === getChosenSubclass(classKey));
    if (!sub) return;
    const lvl = classLevelOf(classKey);
    parseSubclassSections(sub).filter(s => s.level <= lvl).forEach(s => {
        appendFeatureItem(box, s.title, s.text, s.level);
    });
}
function refreshSubclasses() {
    const c1 = document.getElementById('charClass').value;
    populateSubclassOptions(c1, 'charSubclass', 'subclassGroup');
    renderSubclassInto('subclassFeatures', c1);
    if (state.mc && state.mc.enabled && state.mc.class2 && state.mc.class2 !== c1) {
        populateSubclassOptions(state.mc.class2, 'charSubclass2', 'subclassGroup2');
        renderSubclassInto('subclassFeatures2', state.mc.class2);
    } else {
        const g2 = document.getElementById('subclassGroup2');
        if (g2) g2.style.display = 'none';
        const f2 = document.getElementById('subclassFeatures2');
        if (f2) f2.innerHTML = '';
    }
}
function subclassSectionsText(classKey, level) {
    const sub = getSubclassesOf(classKey).find(s => s.name === getChosenSubclass(classKey));
    if (!sub) return '';
    const lvl = level != null ? level : (classLevelOf(classKey) || (character.level || 1));
    return parseSubclassSections(sub).filter(s => s.level <= lvl)
        .map(s => `${s.title}: ${s.text}`).join('\n');
}

// ---- Multiclasse ----
function refreshMulticlassBox() {
    const on = !!(state.mc && state.mc.enabled);
    const box = document.getElementById('multiclassBox');
    if (box) box.style.display = on ? 'block' : 'none';
    const cb2 = document.getElementById('classBox2');
    if (cb2) cb2.style.display = (on && state.mc.class2 && CLASSES[state.mc.class2]) ? 'block' : 'none';
    const hint = document.getElementById('multiclassHint');
    if (hint) {
        if (!on) hint.textContent = '';
        else {
            const total = getTotalLevel();
            hint.textContent = `Nível total: ${total}/20.` + (total > 20 ? ' Reduza os níveis (máximo 20).' : '');
        }
    }
    const l2 = document.getElementById('charLevel2');
    if (l2 && on) {
        const max = Math.max(1, 20 - getCurrentLevel());
        l2.max = max;
        if ((state.mc.level2 || 1) > max) { state.mc.level2 = max; l2.value = max; }
    }
}
function renderClass2Info() {
    const key = state.mc && state.mc.class2;
    const cd = (key && CLASSES[key]) || null;
    const lvl = cd ? Math.max(1, state.mc.level2 || 1) : 0;
    const d = document.getElementById('classDesc2');
    if (d) d.textContent = cd ? cd.description : '';
    const f = document.getElementById('classFeatures2');
    if (f) {
        f.innerHTML = '';
        if (cd) getFeaturesUpToLevel(cd, lvl).forEach(fe => appendFeatureItem(f, fe.name, fe.desc, fe.level));
    }
    const m = document.getElementById('classMeta2');
    if (m) {
        m.textContent = '';
        if (cd) {
            const st = cd.savingThrows || [];
            m.textContent = `${cd.hitDice} PV, salvaguardas: ${st.map(a => ATTR_NAMES[a]).join(', ') || '-'}, proficiencias: ${(cd.armorProficiencies || []).join(', ') || 'nenhuma'}`;
        }
    }
}
function refreshMulticlassAll() {
    refreshMulticlassBox();
    renderClass2Info();
    refreshSubclasses();
    updateSkillsAvailability();
    renderASI();
    updateAllCalculations();
}

// ---- Melhoria de Atributo (ASI) / Dádiva Épica ----
function asiLevelsFor(classKey) {
    const out = [4, 8, 12, 16];
    if (classKey === 'guerreiro') out.push(6, 14);
    if (classKey === 'ladino') out.push(10);
    return out.sort((a, b) => a - b);
}
function asiSlots() {
    const slots = [];
    getClassLevels().forEach(({ key, data, level }) => {
        asiLevelsFor(key).forEach(lv => {
            if (level >= lv) slots.push({ cls: key, clsName: data.name || key, level: lv, epic: false });
        });
        if (level >= 19) slots.push({ cls: key, clsName: data.name || key, level: 19, epic: true });
    });
    return slots.sort((a, b) => a.level - b.level || (a.cls < b.cls ? -1 : 1));
}
function getAsiEntry(cls, level) {
    return (state.asi || []).find(e => e.cls === cls && e.level === level);
}
function asiBonusForAttr(attr) {
    return (state.asi || []).filter(e => e.kind === 'attr' && e.attr === attr).reduce(a => a + 2, 0);
}
function renderASI() {
    const block = document.getElementById('asiBlock');
    const list = document.getElementById('asiList');
    if (!block || !list) return;
    const slots = asiSlots();
    // remove escolhas de níveis que não existem mais
    state.asi = (state.asi || []).filter(e => slots.some(s => s.cls === e.cls && s.level === e.level));
    list.innerHTML = '';
    if (!slots.length) { block.style.display = 'none'; return; }
    block.style.display = 'block';
    slots.forEach(s => {
        const entry = getAsiEntry(s.cls, s.level) || { kind: s.epic ? 'feat' : 'attr', attr: '', feat: '' };
        const row = document.createElement('div');
        row.className = 'choice-group';
        row.dataset.asiCls = s.cls;
        row.dataset.asiLevel = s.level;
        const label = document.createElement('span');
        label.className = 'choice-label';
        label.textContent = `${s.clsName} — Nível ${s.level}${s.epic ? ' (Dádiva Épica)' : ''}`;
        row.appendChild(label);
        const cards = document.createElement('div');
        cards.className = 'choice-cards';
        if (!s.epic) {
            const attrSel = document.createElement('select');
            attrSel.dataset.asiKind = 'attr';
            attrSel.style.display = entry.kind === 'feat' ? 'none' : '';
            attrSel.innerHTML = '<option value="">Atributo +2…</option>' +
                ATTRIBUTES.map(a => `<option value="${a}"${entry.kind === 'attr' && entry.attr === a ? ' selected' : ''}>${ATTR_NAMES[a]} +2</option>`).join('');
            cards.appendChild(attrSel);
        }
        const cats = s.epic ? ['Dádiva Épica'] : ['Geral', 'Origem'];
        const featSel = document.createElement('select');
        featSel.dataset.asiKind = 'feat';
        featSel.style.display = (!s.epic && entry.kind !== 'feat') ? 'none' : '';
        const featNames = Object.keys(FEATS).filter(n => cats.includes(FEATS[n].category)).sort();
        featSel.innerHTML = '<option value="">Talento…</option>' +
            featNames.map(n => `<option value="${n}"${entry.kind === 'feat' && entry.feat === n ? ' selected' : ''}>${n}</option>`).join('');
        cards.appendChild(featSel);
        row.appendChild(cards);
        // reflete a escolha atual nos selects
        const kindSel = document.createElement('select');
        kindSel.dataset.asiKind = 'kind';
        kindSel.innerHTML = s.epic
            ? '<option value="feat">Talento (Dádiva Épica)</option>'
            : `<option value="attr"${entry.kind !== 'feat' ? ' selected' : ''}>Atributo</option>
               <option value="feat"${entry.kind === 'feat' ? ' selected' : ''}>Talento</option>`;
        row.insertBefore(kindSel, cards);
        list.appendChild(row);
    });
}
function handleAsiChange(row) {
    const cls = row.dataset.asiCls;
    const level = parseInt(row.dataset.asiLevel, 10);
    const kind = row.querySelector('select[data-asi-kind="kind"]').value;
    const attr = (row.querySelector('select[data-asi-kind="attr"]') || {}).value || '';
    const feat = (row.querySelector('select[data-asi-kind="feat"]') || {}).value || '';
    state.asi = (state.asi || []).filter(e => !(e.cls === cls && e.level === level));
    if ((kind === 'attr' && attr) || (kind === 'feat' && feat)) {
        state.asi.push({ cls, level, epic: level >= 19, kind, attr, feat });
    }
    const attrSel = row.querySelector('select[data-asi-kind="attr"]');
    const featSel = row.querySelector('select[data-asi-kind="feat"]');
    if (attrSel) attrSel.style.display = kind === 'attr' ? '' : 'none';
    if (featSel) featSel.style.display = kind === 'feat' ? '' : 'none';
    renderFeats();
    updateAllCalculations();
}

// ---- Conjurador ativo + espaços combinados (multiclasse) ----
function getActiveCaster() {
    const levels = getClassLevels();
    const prim = levels[0];
    if (prim && prim.data.castingStat) return prim;
    const sec = levels[1];
    if (sec && sec.data.castingStat) return sec;
    return prim || null;
}
function getCombinedCasterLevel(levels) {
    let full = 0, half = 0;
    (levels || getClassLevels()).forEach(({ key, level }) => {
        const p = getCasterProgression(key);
        if (p === 'full') full += level;
        else if (p === 'half') half += level;
    });
    return full + Math.floor(half / 2);
}
function getEffectiveSlots(levels) {
    const lv = levels || getClassLevels();
    if (lv.length <= 1) {
        const c = lv[0];
        return c ? getSpellSlots(c.key, c.level) : { slots: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 }, pact: null };
    }
    const mc = Math.min(getCombinedCasterLevel(lv), 20);
    const slots = {};
    for (let k = 1; k <= 9; k++) slots[k] = 0;
    if (mc > 0) FULL_SLOTS[mc - 1].forEach((n, i) => { slots[i + 1] = n; });
    let pact = null;
    lv.forEach(({ key, level }) => {
        if (getCasterProgression(key) === 'pact') {
            const p = getSpellSlots(key, level).pact;
            if (p && (!pact || p.lvl > pact.lvl)) pact = p;
        }
    });
    return { slots, pact };
}

// =============================================================================
// VALIDAÇÃO DA FICHA
// =============================================================================
function validateCharacter() {
    const issues = [];
    const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    if (!val('charName').trim()) issues.push({ level: 'aviso', text: 'Nome do personagem vazio (passo 1).' });
    const c1 = val('charClass');
    if (!c1) issues.push({ level: 'erro', text: 'Classe não selecionada (passo 2).' });
    if (!val('charSpecies')) issues.push({ level: 'erro', text: 'Espécie não selecionada (passo 2).' });
    if (!val('charBackground')) issues.push({ level: 'erro', text: 'Antecedente não selecionado (passo 2).' });

    const missingAttrs = ATTRIBUTES.filter(a => getBaseAttr(a) == null);
    if (missingAttrs.length) {
        issues.push({ level: 'erro', text: `Atributos sem valor: ${missingAttrs.map(a => ATTR_NAMES[a]).join(', ')} (passo 3).` });
    }

    const classData = CLASSES[c1];
    const bgData = BACKGROUNDS[val('charBackground')];
    const bgSkills = (bgData && bgData.skills) || [];
    if (classData) {
        const classOpts = [];
        getClassLevels().forEach(({ data }) => {
            (data.skillOptions || []).forEach(s => { if (!classOpts.includes(s)) classOpts.push(s); });
        });
        const checkedClass = getSelectedSkills().filter(s => classOpts.includes(s) && !bgSkills.includes(s));
        const remaining = classData.skillsCount - checkedClass.length;
        if (remaining > 0) issues.push({ level: 'aviso', text: `Faltam ${remaining} perícia(s) de classe (passo 4).` });
        const cGroups = classData.equipmentChoices || [];
        const cPend = cGroups.filter((g, i) => !state.classEquipSel[i]).length;
        if (cPend > 0) issues.push({ level: 'aviso', text: `Escolhas de equipamento da classe pendentes: ${cPend} (passo 5).` });
    }
    if (bgData) {
        const bGroups = bgData.equipmentChoices || [];
        const bPend = bGroups.filter((g, i) => !state.bgEquipSel[i]).length;
        if (bPend > 0) issues.push({ level: 'aviso', text: `Escolhas de equipamento do antecedente pendentes: ${bPend} (passo 5).` });
    }

    const caster = getActiveCaster();
    if (caster) {
        const totalSel = Object.keys(state.spells).reduce((a, k) => a + ((state.spells[k] || []).length), 0);
        if (totalSel === 0) issues.push({ level: 'aviso', text: 'Nenhuma magia selecionada (passo 7).' });
    }

    const pendingAsi = asiSlots().filter(s => {
        const e = getAsiEntry(s.cls, s.level);
        return !e || (e.kind === 'attr' && !e.attr) || (e.kind === 'feat' && !e.feat);
    });
    if (pendingAsi.length) {
        issues.push({
            level: 'aviso',
            text: `Melhoria de atributo pendente: ${pendingAsi.map(s => `${(CLASSES[s.cls] || {}).name || s.cls} ${s.level}`).join(', ')}.`
        });
    }

    if (getTotalLevel() > 20) issues.push({ level: 'erro', text: 'Nível total acima de 20 (multiclasse).' });
    if (state.mc && state.mc.enabled && !state.mc.class2) {
        issues.push({ level: 'aviso', text: 'Multiclasse ativa sem segunda classe (passo 2).' });
    }
    try {
        if (moneyRemaining() < 0) issues.push({ level: 'erro', text: 'Dinheiro negativo (passo 5).' });
    } catch (e) { /* ignora */ }
    if ((state.languagesChosen || []).length < 2) {
        issues.push({ level: 'aviso', text: 'Escolha 2 idiomas além do Comum (passo 2).' });
    }
    return issues;
}

function renderValidation() {
    const box = document.getElementById('validationBox');
    if (!box) return;
    box.innerHTML = '';
    const issues = validateCharacter();
    const errors = issues.filter(i => i.level === 'erro');
    const warns = issues.filter(i => i.level !== 'erro');
    if (!issues.length) {
        box.className = 'validation-box valid';
        box.textContent = 'Ficha válida — pronta para exportar.';
        return;
    }
    box.className = 'validation-box' + (errors.length ? ' has-errors' : ' has-warnings');
    const title = document.createElement('strong');
    title.textContent = errors.length
        ? `${errors.length} erro(s) e ${warns.length} aviso(s):`
        : `${warns.length} aviso(s):`;
    box.appendChild(title);
    const ul = document.createElement('ul');
    issues.forEach(i => {
        const li = document.createElement('li');
        li.className = i.level === 'erro' ? 'val-error' : 'val-warn';
        li.textContent = i.text;
        ul.appendChild(li);
    });
    box.appendChild(ul);
}

// =============================================================================
// UNDO / REDO (snapshots de estado + inputs)
// =============================================================================
let undoStack = [];
let redoStack = [];
let historyTimer = null;

function captureSnapshot() {
    const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const chk = (id) => { const el = document.getElementById(id); return !!(el && el.checked); };
    const attrInputs = {};
    document.querySelectorAll('#attributesGrid input[data-attr]').forEach(i => { attrInputs[i.dataset.attr] = i.value; });
    return JSON.stringify({
        state,
        inputs: {
            charName: val('charName'), charLevel: val('charLevel'), charAlignment: val('charAlignment'),
            charClass: val('charClass'), charSpecies: val('charSpecies'), charSubrace: val('charSubrace'),
            charBackground: val('charBackground'), charClass2: val('charClass2'), charLevel2: val('charLevel2'),
            charSubclass: val('charSubclass'), charSubclass2: val('charSubclass2'),
            attrMethod: val('attrMethod'), attrInputs, featsHomebrew: val('featsHomebrew'),
            multiclassToggle: chk('multiclassToggle'), freeSkillsToggle: chk('freeSkillsToggle'),
            originSwapToggle: chk('originSwapToggle'), extraAllowedToggle: chk('extraAllowedToggle'),
            charLanguages1: val('charLanguages1'), charLanguages2: val('charLanguages2'),
            skillsChecked: [...document.querySelectorAll('#skillsGrid input[type="checkbox"]:checked')].map(cb => cb.dataset.skill)
        }
    });
}

function scheduleHistoryPush() {
    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(() => {
        historyTimer = null;
        pushHistory();
    }, 300);
}

function pushHistory() {
    const snap = captureSnapshot();
    if (undoStack.length && undoStack[undoStack.length - 1] === snap) return;
    undoStack.push(snap);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    updateUndoButtons();
}

function resetHistory() {
    undoStack = [captureSnapshot()];
    redoStack = [];
    updateUndoButtons();
}

function updateUndoButtons() {
    const u = document.getElementById('undoBtn');
    const r = document.getElementById('redoBtn');
    if (u) u.disabled = undoStack.length < 2;
    if (r) r.disabled = !redoStack.length;
}

function restoreSnapshot(snap) {
    const data = JSON.parse(snap);
    const savedVals = Object.assign({}, (data.state && data.state.attrValues) || {});
    state = data.state;
    const I = data.inputs;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    setVal('charName', I.charName);
    setVal('charLevel', I.charLevel);
    setVal('charAlignment', I.charAlignment);
    setVal('charClass', I.charClass);
    setVal('charSpecies', I.charSpecies);
    setVal('charBackground', I.charBackground);
    setVal('charClass2', I.charClass2);
    setVal('charLevel2', I.charLevel2);
    setVal('attrMethod', I.attrMethod);
    setVal('featsHomebrew', I.featsHomebrew);
    setVal('charLanguages1', I.charLanguages1);
    setVal('charLanguages2', I.charLanguages2);
    setChk('multiclassToggle', I.multiclassToggle);
    setChk('freeSkillsToggle', I.freeSkillsToggle);
    setChk('originSwapToggle', I.originSwapToggle);
    setChk('extraAllowedToggle', I.extraAllowedToggle);
    renderAttributes();
    if (I.attrMethod === 'standard' || I.attrMethod === 'roll') {
        ATTRIBUTES.forEach(a => {
            state.attrValues[a] = savedVals[a];
            refreshAttrSelectOptions(a);
        });
    } else {
        ATTRIBUTES.forEach(a => {
            const inp = document.querySelector(`#attributesGrid input[data-attr="${a}"]`);
            if (inp && I.attrInputs && I.attrInputs[a] != null) inp.value = I.attrInputs[a];
        });
    }
    updateBonusButtons();
    document.querySelectorAll('#skillsGrid input[type="checkbox"]').forEach(cb => {
        cb.checked = (I.skillsChecked || []).includes(cb.dataset.skill);
    });
    populateLanguages();
    document.getElementById('charSubrace').value = I.charSubrace || '';
    syncBasicsFromSelects();
    renderFeats();
    renderEquipmentChoices();
    renderExtraEquipmentList();
    renderASI();
    populateSubclassOptions(document.getElementById('charClass').value, 'charSubclass', 'subclassGroup');
    const sel1 = document.getElementById('charSubclass');
    if (sel1 && I.charSubclass) sel1.value = I.charSubclass;
    if (state.mc && state.mc.enabled && state.mc.class2) {
        populateSubclassOptions(state.mc.class2, 'charSubclass2', 'subclassGroup2');
        const sel2 = document.getElementById('charSubclass2');
        if (sel2 && I.charSubclass2) sel2.value = I.charSubclass2;
    }
    renderClass2Info();
    refreshMulticlassBox();
    updateSkillsAvailability();
    updateAllCalculations();
}

function doUndo() {
    if (undoStack.length < 2) return;
    redoStack.push(undoStack.pop());
    restoreSnapshot(undoStack[undoStack.length - 1]);
    updateUndoButtons();
}

function doRedo() {
    if (!redoStack.length) return;
    const snap = redoStack.pop();
    undoStack.push(snap);
    restoreSnapshot(snap);
    updateUndoButtons();
}

// =============================================================================
// EQUIPAMENTO
// =============================================================================
function renderEquipmentChoices() {
    const container = document.getElementById('classEquipmentChoices');
    container.innerHTML = '';
    const className = document.getElementById('charClass').value;
    const classData = CLASSES[className];
    const groups = (classData && classData.equipmentChoices) || [];
    state.classEquipSel = groups.map((g, i) => state.classEquipSel[i] || null);

    buildChoiceCards(container, groups, 'classEquipSel', selectEquipOption);
    renderInventory();
}

function renderBgEquipmentChoices() {
    const container = document.getElementById('bgEquipmentChoices');
    container.innerHTML = '';
    const name = document.getElementById('charBackground').value;
    const bg = BACKGROUNDS[name];
    const groups = (bg && bg.equipmentChoices) || [];
    state.bgEquipSel = groups.map((g, i) => state.bgEquipSel[i] || null);
    if (!groups.length && bg && bg.equipment) {
        groups.push([bg.equipment.split(', ').map(s => s.trim()).filter(Boolean)]);
    }

    buildChoiceCards(container, groups, 'bgEquipSel', selectBgEquipOption);
    renderInventory();
}

function buildChoiceCards(container, groups, stateKey, selectFn) {
    groups.forEach((rawOpts, gi) => {
        const options = (rawOpts && !Array.isArray(rawOpts)) ? [rawOpts] : rawOpts;
        const group = document.createElement('div');
        group.className = 'choice-group';
        const label = document.createElement('span');
        label.className = 'choice-label';
        const letters = options.map(o => (!Array.isArray(o) && o && o.ab) ? o.ab : '').filter(Boolean);
        label.textContent = letters.length === options.length
            ? 'Escolha ' + letters.join(' ou ')
            : `Escolha ${gi + 1}`;
        group.appendChild(label);

        const cards = document.createElement('div');
        cards.className = 'choice-cards';
        options.forEach((opt) => {
            const items = Array.isArray(opt) ? opt : (opt.items || []);
            const ab = (!Array.isArray(opt) && opt && opt.ab) ? opt.ab : '';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'choice-card' + (state[stateKey][gi] && arraysEqual(state[stateKey][gi], items) ? ' selected' : '');
            if (ab) {
                const badge = document.createElement('span');
                badge.className = 'choice-ab';
                badge.textContent = ab;
                btn.appendChild(badge);
            }
            btn.appendChild(document.createTextNode(items.join(', ')));
            btn.onclick = () => selectFn(gi, items, cards, btn);
            cards.appendChild(btn);
        });
        group.appendChild(cards);
        container.appendChild(group);
    });
}

function selectEquipOption(gi, items, cards, btn) {
    state.classEquipSel[gi] = items;
    cards.querySelectorAll('.choice-card').forEach(c => c.classList.remove('selected'));
    if (btn) btn.classList.add('selected');
    renderInventory();
    updateAllCalculations();
}

function selectBgEquipOption(gi, items, cards, btn) {
    state.bgEquipSel[gi] = items;
    cards.querySelectorAll('.choice-card').forEach(c => c.classList.remove('selected'));
    if (btn) btn.classList.add('selected');
    renderInventory();
    updateAllCalculations();
}

function addItem() {
    const sel = document.getElementById('itemSelect');
    const val = sel.value;
    if (!val || val.includes('--')) return;
    if (state.extraEquipment.includes(val)) {
        alert(`${val} já está na lista de itens extras.`);
        return;
    }
    const cost = itemCostPO(val);
    if (cost > moneyRemaining() + 1e-7) {
        alert(`Dinheiro insuficiente para comprar ${val}. Custa ${formatCoins(cost)} e restam ${formatCoins(moneyRemaining())}.`);
        return;
    }
    state.extraEquipment.push(val);
    renderExtraEquipmentList();
    renderInventory();
}

function renderExtraEquipmentList() {
    const box = document.getElementById('extraEquipBox');
    const list = document.getElementById('extraEquipmentList');
    list.innerHTML = '';
    box.style.display = state.extraEquipment.length ? 'block' : 'none';
    state.extraEquipment.forEach((item, idx) => {
        const li = document.createElement('li');
        li.textContent = item;
        const rm = document.createElement('button');
        rm.className = 'remove-item';
        rm.textContent = '\u00D7';
        rm.onclick = () => { state.extraEquipment.splice(idx, 1); renderExtraEquipmentList(); renderInventory(); updateAllCalculations(); };
        li.appendChild(rm);
        list.appendChild(li);
    });
}

// --- Resolucao de nomes para o catalogo ---
const ITEM_ALIASES = {
    "Armadura de Couro": "Couro",
    "Armadura de Couro Batido": "Couro Batido",
    "Kit de Explorador": "Kit de Explorador de Masmorras",
    "Kit de Jogo": "Kit de Jogos",
    "Livro de Magias": "Livro",
    "Fantasia": "Roupas, Fantasia",
    "Roupas Finas": "Roupas, Finas",
    "Roupas de Viagem": "Roupas, Viagem",
    "Balde de Ferro": "Balde",
    "Rações (10 dias)": "Rações",
    "Kit de Jogo (o mesmo que acima)": "Kit de Jogos",
    "Kit de Jogos (qualquer um)": "Kit de Jogos",
    "Kit de Jogos (o mesmo que acima)": "Kit de Jogos",
    "Fantasias": "Roupas, Fantasia",
    "Ferramentas de Artesão escolhido para a proficiência com ferramenta acima": "Ferramentas de Artesão",
    "Ferramentas de Artesão (a mesma que acima)": "Ferramentas de Artesão",
    "Ferramentas de Artesão (escolha)": "Ferramentas de Artesão",
    "Instrumento Musical (o mesmo que acima)": "Instrumento Musical",
    "Instrumento Musical (escolha)": "Instrumento Musical",
    "Foco Arcano (Cajado)": "Foco Arcano",
    "Foco Arcano (cristal)": "Foco Arcano",
    "Foco Arcano (orbe)": "Foco Arcano",
    "Foco Arcano (varinha)": "Foco Arcano",
    "Foco Druídico (Cajado)": "Foco Druídico",
    "Foco Druídico (ramo de visco)": "Foco Druídico",
    "Símbolo Sagrado (amuleto)": "Símbolo Sagrado",
    "Livro (orações)": "Livro",
    "Livro (filosofia)": "Livro",
    "Livro (história)": "Livro",
    "Livro (conhecimento oculto)": "Livro",
    "Pergaminho (10 folhas)": "Pergaminho",
    "Pergaminho (12 folhas)": "Pergaminho",
    "Pergaminho (8 folhas)": "Pergaminho",
    "Óleo (3 frascos)": "Óleo",
    "Suprimentos de Calígrafo": "Suprimentos de Calígrafo"
};

const MONEY_RE = /^\d[\d.,]*\s*(PE|PO|PP|PC)$/;

const MONEY_PO_UNIT = { PE: 10, PO: 1, PP: 0.1, PC: 0.01 };

function parseMoneyPO(text) {
    const m = String(text).trim().match(/^([\d.,]+)\s*(PE|PO|PP|PC)$/);
    if (!m) return 0;
    const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
    if (!isFinite(v) || v < 0) return 0;
    return Math.round(v * (MONEY_PO_UNIT[m[2]] || 0) * 100) / 100;
}

function itemCostPO(name) {
    let cost = '';
    if (WEAPONS[name]) cost = WEAPONS[name].cost;
    else if (ARMORS[name]) cost = ARMORS[name].cost;
    else if (name === 'Escudo') cost = (SHIELD && SHIELD.cost) || '';
    else if (ITEMS[name]) cost = ITEMS[name].cost;
    if (!cost || cost === 'Varia' || cost === '—') return 0;
    return parseMoneyPO(cost);
}

function moneyFromSelections() {
    let total = 0;
    state.classEquipSel.forEach(g => { if (g) g.forEach(raw => total += parseMoneyPO(raw)); });
    state.bgEquipSel.forEach(g => { if (g) g.forEach(raw => total += parseMoneyPO(raw)); });
    return Math.round(total * 100) / 100;
}

function moneySpentOnExtras() {
    return state.extraEquipment.reduce((sum, raw) => sum + itemCostPO(raw), 0);
}

function moneyRemaining() {
    return Math.max(0, Math.round((moneyFromSelections() - moneySpentOnExtras()) * 100) / 100);
}

function coinBreakdown(po) {
    let pc = Math.max(0, Math.round(po * 100));
    const PE = Math.floor(pc / 10000); pc -= PE * 10000;
    const PO = Math.floor(pc / 100); pc -= PO * 100;
    const PP = Math.floor(pc / 10); pc -= PP * 10;
    return { PE, PO, PP, PC: pc };
}

function formatCoins(po) {
    const b = coinBreakdown(po);
    const parts = [];
    if (b.PE) parts.push(`${b.PE} PE`);
    if (b.PO) parts.push(`${b.PO} PO`);
    if (b.PP) parts.push(`${b.PP} PP`);
    if (b.PC) parts.push(`${b.PC} PC`);
    return parts.length ? parts.join(', ') : '0 PO';
}

function renderMoney() {
    const b = coinBreakdown(moneyRemaining());
    ['PE', 'PO', 'PP', 'PC'].forEach(k => {
        const el = document.getElementById('money' + k);
        if (el) el.textContent = b[k];
    });
}

function knownBase(name) {
    return WEAPONS[name] || ARMORS[name] || ITEMS[name] || name === 'Escudo';
}

function singularBase(name) {
    if (knownBase(name)) return name;
    if (name.endsWith('s')) {
        const s1 = name.slice(0, -1);
        if (knownBase(s1)) return s1;
        if (name.endsWith('es') && knownBase(name.slice(0, -2))) return name.slice(0, -2);
        if (name.endsWith('ias') && knownBase(name.slice(0, -1))) return name.slice(0, -1);
    }
    return null;
}

function resolveItem(raw) {
    raw = raw.trim();
    if (raw.indexOf('Ferramentas de Artesão ou Instrumento Musical') !== -1) {
        return { name: ['Ferramentas de Artesão', 'Instrumento Musical'], raw };
    }
    const aliased = ITEM_ALIASES[raw];
    if (aliased) return { name: aliased.split('+').map(s => s.trim()), raw };
    if (MONEY_RE.test(raw)) return { money: raw, name: null, raw };
    let name = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
    let qty = 1;
    const m = name.match(/^(\d+)\s+(.+)$/);
    if (m) { qty = parseInt(m[1], 10); name = m[2]; }
    let base = knownBase(name) ? name : singularBase(name);
    if (!base) base = ITEM_ALIASES[name] || null;
    if (!base) {
        const estrip = name.replace(/[.,]\s*$/, '');
        if (knownBase(estrip)) base = estrip;
    }
    return { name: base ? [base] : null, qty, raw };
}

function gatherOwnedTokens() {
    const list = [];
    state.classEquipSel.forEach(g => { if (g) list.push(...g); });
    state.bgEquipSel.forEach(g => { if (g) list.push(...g); });
    state.extraEquipment.forEach(i => list.push(i));
    return list;
}

function getInventoryEntries() {
    const agg = {};
    let totalMoney = 0;
    gatherOwnedTokens().forEach(raw => {
        const r = resolveItem(raw);
        if (r.money) {
            totalMoney += parseMoneyPO(r.raw);
            return;
        }
        if (!r.name) {
            agg[`x:${raw}`] = { key: `x:${raw}`, raw, name: raw, qty: 1, catalog: false, show: raw };
            return;
        }
        r.name.forEach(base => {
            if (!agg[base]) {
                const kind = WEAPONS[base] ? 'weapon' : ARMORS[base] ? 'armor' : base === 'Escudo' ? 'shield' : 'item';
                agg[base] = { key: base, raw: r.raw, name: base, qty: 0, catalog: true, kind, show: r.raw };
            }
            agg[base].qty += r.qty;
            if (agg[base].show !== base) agg[base].show = base;
        });
    });
    const entries = Object.values(agg);
    entries.sort((a, b) => {
        const order = { armor: 0, weapon: 1, shield: 2, item: 3, other: 4 };
        const ka = a.catalog ? order[a.kind] : 4;
        const kb = b.catalog ? order[b.kind] : 4;
        if (ka !== kb) return ka - kb;
        return a.name.localeCompare(b.name, 'pt-BR');
    });
    const starting = moneyFromSelections();
    const remaining = moneyRemaining();
    if (starting > 0 || totalMoney > 0) {
        entries.push({ key: '$$', raw: '', name: 'Moedas', qty: 0, catalog: false,
                       kind: 'money', show: `Poço de moedas`, moneyText: formatCoins(remaining) });
    }
    return entries;
}

function inventoryItemDetail(entry) {
    const name = entry.name;
    if (WEAPONS[name]) {
        const w = WEAPONS[name];
        return `${w.damage} ${w.type} · ${w.properties.join(', ')}${w.mastery ? ' · Maestria ' + w.mastery : ''} · ${w.cost}`;
    }
    if (ARMORS[name]) {
        const a = ARMORS[name];
        let ca = `${a.caBase}`;
        if (a.dexBonus) ca += a.maxDex != null ? ` + DES (máx ${a.maxDex})` : ` + DES`;
        return `CA ${ca}${a.stealthDisadv ? ' · Desvantagem em Furtividade' : ''}${a.strReq ? ' · For mín ' + a.strReq : ''} · ${a.cost}`;
    }
    if (name === 'Escudo') return `+${SHIELD.caBonus} de CA · ${SHIELD.cost || ''}`;
    const it = ITEMS[name];
    return it ? `${it.cost || ''}${it.weight ? ' · ' + it.weight : ''}`.trim() : '';
}

function renderInventory() {
    renderMoney();
    const list = document.getElementById('inventoryList');
    list.innerHTML = '';
    const entries = getInventoryEntries();
    const equipped = new Set(state.equipped);
    entries.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'inv-row' + (entry.catalog ? '' : ' inv-row-plain');
        if (entry.catalog) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'inv-equip';
            cb.checked = equipped.has(entry.name);
            cb.dataset.inv = entry.name;
            cb.addEventListener('change', () => toggleEquip(entry.name, cb));
            row.appendChild(cb);
        }
        const info = document.createElement('div');
        info.className = 'inv-info';
        const label = document.createElement('span');
        label.className = 'inv-name';
        label.textContent = entry.qty > 1 ? `${entry.name} ×${entry.qty}` : entry.name;
        info.appendChild(label);
        const detail = inventoryItemDetail(entry);
        if (detail) {
            const d = document.createElement('span');
            d.className = 'inv-detail';
            d.textContent = detail;
            info.appendChild(d);
        }
        row.appendChild(info);
        if (!entry.catalog) {
            const src = document.createElement('span');
            src.className = 'inv-src';
            src.textContent = entry.moneyText ? entry.moneyText : (entry.kind === 'money' ? '' : 'outro item');
            row.appendChild(src);
        } else {
            const eq = document.createElement('span');
            eq.className = 'inv-src';
            eq.textContent = equipped.has(entry.name) ? 'Equipado' : '';
            row.appendChild(eq);
        }
        list.appendChild(row);
    });
    if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.textContent = 'Selecione as escolhas de Classe e Antecedente para montar seu inventário.';
        list.appendChild(empty);
    }
    // Remove equipados que sairam do inventario
    state.equipped = entries.filter(e => e.catalog && equipped.has(e.name)).map(e => e.name);
    renderAttacks();
}

function toggleEquip(name, cb) {
    if (ARMORS[name]) {
        if (cb.checked) state.equipped = state.equipped.filter(n => !ARMORS[n]);
    }
    if (cb.checked) {
        if (!state.equipped.includes(name)) state.equipped.push(name);
    } else {
        state.equipped = state.equipped.filter(n => n !== name);
    }
    renderInventory();
    updateAllCalculations();
}

function getEquippedArmor() {
    const eq = state.equipped.find(n => ARMORS[n]);
    return eq || 'Nenhuma';
}

function getEquippedWeapons() {
    return state.equipped.filter(n => WEAPONS[n]);
}

function hasShieldEquipped() {
    return state.equipped.includes('Escudo');
}

function geEquipmentList() {
    return getInventoryEntries()
        .filter(e => e.catalog)
        .map(e => e.qty > 1 ? `${e.name} ×${e.qty}` : e.name);
}

// =============================================================================
// MAGIAS
// =============================================================================
function renderSpells() {
    const caster = getActiveCaster();
    const step = document.getElementById('spellsStep');
    const columns = document.getElementById('spellsColumns');

    if (!caster || !caster.data.castingStat) {
        step.style.display = 'none';
        state.spells = {
            cantrips: [], lvl1: [], lvl2: [], lvl3: [], lvl4: [],
            lvl5: [], lvl6: [], lvl7: [], lvl8: [], lvl9: []
        };
        if (columns) columns.innerHTML = '';
        const slotsBox = document.getElementById('spellSlotsBox');
        if (slotsBox) slotsBox.innerHTML = '';
        renderSpellsChosen();
        return;
    }
    step.style.display = 'block';

    const className = caster.key;
    const classData = caster.data;
    const level = caster.level;
    const castingMod = calcModifier(getFinalAttributes()[classData.castingStat]);
    const profBonus = getProficiencyBonus(getTotalLevel());
    const dc = 8 + castingMod + profBonus;
    const atk = castingMod + profBonus;
    document.getElementById('spellStats').innerHTML = `
        <div class="spell-stat"><span class="s-val">${formatModifier(castingMod)}</span><span class="s-lbl">Mod. ${ATTR_NAMES[classData.castingStat]}</span></div>
        <div class="spell-stat"><span class="s-val">${dc}</span><span class="s-lbl">CD</span></div>
        <div class="spell-stat"><span class="s-val">${formatModifier(atk)}</span><span class="s-lbl">Bônus de Ataque</span></div>
    `;

    const classSpells = SPELLS.filter(s => (s.classes || []).includes(className));
    columns.innerHTML = '';

    const preparedMax = getSpellsPreparedMax(classData, castingMod, level);
    const totalHint = document.createElement('p');
    totalHint.className = 'spell-count';
    totalHint.textContent = `Total de magias de círculo 1 ou superior: máximo de ${preparedMax}`;
    columns.appendChild(totalHint);

    const cantrips = classSpells.filter(s => s.level === 0);
    addSpellColumn(columns, 'Truques', 'cantrips', cantrips, getCantripsKnown(classData, level), 'truque', false);

    for (let k = 1; k <= 9; k++) {
        if (level < CIRCLE_MIN_LEVEL[k]) break;
        addSpellColumn(columns, `${k}º Círculo`, `lvl${k}`, classSpells.filter(s => s.level === k), preparedMax, 'magia', false);
    }

    renderSpellSlots();
    renderSpellsChosen();
}

function renderSpellSlots() {
    const box = document.getElementById('spellSlotsBox');
    if (!box) return;
    box.innerHTML = '';
    const { slots, pact } = getEffectiveSlots();
    const title = document.createElement('span');
    title.className = 'slots-title';
    title.textContent = 'Espaços de magia:';
    box.appendChild(title);
    let any = false;
    for (let k = 1; k <= 9; k++) {
        if (!slots[k]) continue;
        any = true;
        const b = document.createElement('span');
        b.className = 'slot-badge';
        b.textContent = `${k}º [${slots[k]}]`;
        b.title = `${slots[k]} espaços de ${k}º círculo`;
        box.appendChild(b);
    }
    if (pact) {
        any = true;
        const b = document.createElement('span');
        b.className = 'slot-badge slot-pact';
        b.textContent = `Pacto ${pact.n}×${pact.lvl}º`;
        b.title = `${pact.n} espaços de pacto de ${pact.lvl}º círculo`;
        box.appendChild(b);
    }
    if (!any) {
        const b = document.createElement('span');
        b.className = 'attacks-empty';
        b.textContent = 'sem espaços';
        box.appendChild(b);
    }
}

function addSpellColumn(parent, title, key, spellList, max, unit, open) {
    const col = document.createElement('div');
    col.className = 'spell-column';
    col.dataset.spellKey = key;
    col.dataset.spellMax = max;
    col.dataset.spellTotal = spellList.length;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'feat-cat-header';
    header.setAttribute('aria-expanded', String(!!open));

    const titleEl = document.createElement('span');
    titleEl.className = 'feat-cat-title';
    titleEl.textContent = title;

    const badge = document.createElement('span');
    badge.className = 'feat-cat-count';
    badge.textContent = `${(state.spells[key] || []).length}/${max} selecionadas · ${spellList.length} ${unit}s disponíveis`;

    header.appendChild(titleEl);
    header.appendChild(badge);

    const list = document.createElement('div');
    list.className = 'feat-cat-list';
    if (open) list.classList.add('open');
    buildSpellCheckboxes(list, spellList, key);

    const count = document.createElement('p');
    count.className = 'spell-count';
    count.textContent = `${spellList.length} ${unit}s disponíveis (máximo ${max} selecionadas)`;
    list.appendChild(count);

    col.appendChild(header);
    col.appendChild(list);
    header.addEventListener('click', () => {
        const isOpen = list.classList.toggle('open');
        header.classList.toggle('open', isOpen);
        header.setAttribute('aria-expanded', String(isOpen));
    });
    if (open) header.classList.add('open');
    parent.appendChild(col);
    return col;
}

function buildSpellCheckboxes(container, spellList, key) {
    container.innerHTML = '';
    spellList.forEach(spell => {
        const row = document.createElement('div');
        row.className = 'feat-row spell-row';
        const id = `spell-${key}-${cssId(spell.name)}`;
        const checked = (state.spells[key] || []).includes(spell.name);
        const meta = `${spell.school || ''}${spell.ritual ? ' · Ritual' : ''}${spell.concentration ? ' · Concentração' : ''}`;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.dataset.spellKey = key;
        input.dataset.spell = spell.name;
        input.checked = checked;
        const body = document.createElement('label');
        body.className = 'feat-body';
        body.htmlFor = id;
        const n = document.createElement('span');
        n.className = 'spell-name';
        n.textContent = spell.name;
        body.appendChild(n);
        if (meta) {
            const m = document.createElement('span');
            m.className = 'spell-meta';
            m.textContent = meta;
            body.appendChild(m);
        }
        const d = document.createElement('span');
        d.className = 'spell-desc';
        d.textContent = spell.desc || '';
        body.appendChild(d);
        row.appendChild(input);
        row.appendChild(body);
        const atkLabel = document.createElement('label');
        atkLabel.className = 'spell-attack-check';
        const atkCb = document.createElement('input');
        atkCb.type = 'checkbox';
        atkCb.dataset.attackCard = spell.name;
        atkCb.dataset.spellKey = key;
        atkCb.checked = !!(state.spellAttackCards && state.spellAttackCards[spell.name] && state.spellAttackCards[spell.name].enabled);
        const atkSpan = document.createElement('span');
        atkSpan.textContent = 'Acrescentar card de ataque';
        atkLabel.appendChild(atkCb);
        atkLabel.appendChild(atkSpan);
        row.appendChild(atkLabel);
        container.appendChild(row);
    });
}

function defaultSpellCard(name, key) {
    const s = SPELLS.find(x => x.name === name) || {};
    const desc = String(s.desc || '');
    const hasAttackRoll = /ataque m[aá]gico|jogada de ataque/i.test(desc);
    const hasSave = /teste de resist[êe]ncia|salvaguarda|CD \d|CD para/i.test(desc);
    let atkStr = '', cdStr = '';
    const caster = getActiveCaster();
    if (caster && caster.data.castingStat) {
        const castMod = calcModifier(getFinalAttributes()[caster.data.castingStat]);
        const profBonus = getProficiencyBonus(getTotalLevel());
        if (hasAttackRoll) atkStr = formatModifier(castMod + profBonus);
        if (hasSave) cdStr = String(8 + castMod + profBonus);
    }
    const dmgMatch = String(s.desc || '').match(/(\d+\s*d\s*\d+(?:\s*[+-]\s*\d+)?)/);
    return {
        enabled: true,
        nome: name,
        circulo: spellCircleLabel(key),
        escola: s.school || '',
        acao: s.castingTime || '',
        alcance: s.range || '',
        duracao: s.duration || '',
        ataque: atkStr,
        cd: cdStr,
        dano: dmgMatch ? dmgMatch[1].replace(/\s+/g, '') : '',
        tipo: spellDamageType(s),
        obs: ''
    };
}

function toggleSpellAttackCard(name, key, on) {
    if (!state.spellAttackCards[name]) state.spellAttackCards[name] = defaultSpellCard(name, key);
    state.spellAttackCards[name].enabled = !!on;
    renderSpellAttacks();
}

function handleSpellToggle(cb) {
    const key = cb.dataset.spellKey;
    const spell = cb.dataset.spell;
    const caster = getActiveCaster();
    const classData = caster && caster.data;
    if (!classData) return;
    const level = caster.level;

    if (cb.checked && key !== 'cantrips') {
        const circle = parseInt(key.replace('lvl', ''), 10) || 0;
        if (level < CIRCLE_MIN_LEVEL[circle]) {
            cb.checked = false;
            return;
        }
    }

    const max = key === 'cantrips'
        ? getCantripsKnown(classData, level)
        : getSpellsPreparedMax(classData, calcModifier(getFinalAttributes()[classData.castingStat]), level);

    let sel = state.spells[key] || [];
    if (cb.checked) {
        if (sel.length >= max) {
            cb.checked = false;
            return;
        }
        if (key !== 'cantrips') {
            const totalOthers = Object.keys(state.spells)
                .filter(k => k !== 'cantrips')
                .reduce((acc, k) => acc + ((state.spells[k] || []).length), 0) - sel.length;
            if (totalOthers + sel.length + 1 > max) {
                cb.checked = false;
                return;
            }
        }
        sel.push(spell);
    } else {
        sel = sel.filter(s => s !== spell);
    }
    state.spells[key] = sel;
}

function updateSpellSummaries() {
    document.querySelectorAll('#spellsColumns .spell-column').forEach(col => {
        const key = col.dataset.spellKey;
        if (!key) return;
        const sel = (state.spells[key] || []).length;
        const max = col.dataset.spellMax;
        const total = col.dataset.spellTotal;
        const unit = key === 'cantrips' ? 'truque' : 'magia';
        const badge = col.querySelector('.feat-cat-count');
        if (badge) badge.textContent = `${sel}/${max} selecionadas · ${total} ${unit}s disponíveis`;
        const countEl = col.querySelector('.spell-count');
        if (countEl) countEl.textContent = `${total} ${unit}s disponíveis (máximo ${max} selecionadas)`;
    });
    renderSpellsChosen();
}

function renderSpellsChosen() {
    const box = document.getElementById('spellsChosen');
    if (!box) return;
    box.innerHTML = '';
    const flat = [];
    Object.keys(state.spells).forEach(key => {
        (state.spells[key] || []).forEach(n => flat.push({ key, name: n }));
    });
    box.classList.toggle('empty', !flat.length);
    flat.forEach(({ key, name }) => {
        const chip = document.createElement('span');
        chip.className = 'feat-chip';
        const lbl = document.createElement('span');
        lbl.textContent = name;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'feat-chip-remove';
        b.dataset.spellKey = key;
        b.dataset.spell = name;
        b.title = 'Remover magia';
        b.textContent = '×';
        chip.appendChild(lbl);
        chip.appendChild(b);
        box.appendChild(chip);
    });
    renderSpellAttacks();
}

function removeSpell(key, name) {
    state.spells[key] = (state.spells[key] || []).filter(s => s !== name);
    document.querySelectorAll(`#spellsColumns input[data-spell-key="${key}"]`).forEach(cb => {
        if (cb.dataset.spell === name) cb.checked = false;
    });
    updateSpellSummaries();
}

// =============================================================================
// TALENTOS
// =============================================================================
const FEAT_CATEGORY_ORDER = ['Origem', 'Geral', 'Estilo de Luta', 'Dádiva Épica'];

function featCategories() {
    const cats = new Set(Object.values(FEATS).map(f => f.category || 'Geral'));
    return FEAT_CATEGORY_ORDER.concat([...cats].filter(c => !FEAT_CATEGORY_ORDER.includes(c)));
}

function cleanFeatDesc(desc) {
    return desc.replace(/\s*\*\*\s*/g, ' ').trim();
}

function backgroundOriginFeatName() {
    const bg = BACKGROUNDS[document.getElementById('charBackground').value];
    if (!bg || !bg.feat) return '';
    if (FEATS[bg.feat]) return bg.feat;
    const base = bg.feat.replace(/ \(.*\)$/, '').trim();
    return FEATS[base] ? base : bg.feat;
}

function originFeatEffective() {
    if (state.originSwap) return state.originFeat || '';
    return backgroundOriginFeatName();
}

function extraFeatsEffective() {
    return state.extraAllowed ? (state.feats || []).slice() : [];
}

function effectiveFeats() {
    const out = [];
    const origin = originFeatEffective();
    if (origin) out.push(origin);
    extraFeatsEffective().forEach(f => { if (!out.includes(f)) out.push(f); });
    return out;
}

function renderFeats() {
    const swapToggle = document.getElementById('originSwapToggle');
    const extraToggle = document.getElementById('extraAllowedToggle');
    const originPicker = document.getElementById('originFeatPicker');
    const extrasInner = document.getElementById('extrasInner');
    if (swapToggle) swapToggle.checked = !!state.originSwap;
    if (extraToggle) extraToggle.checked = !!state.extraAllowed;
    renderOriginFeatCard();
    if (originPicker) {
        originPicker.style.display = state.originSwap ? 'block' : 'none';
        if (state.originSwap) buildFeatPicker(originPicker, 'originFeat', 'Origem');
    }
    if (extrasInner) extrasInner.style.display = state.extraAllowed ? 'block' : 'none';
    if (state.extraAllowed) buildFeatPicker(document.getElementById('extrasPicker'), 'extras', null);
    renderFeatsChosen();
}

function renderOriginFeatCard() {
    const card = document.getElementById('originFeatCard');
    if (!card) return;
    card.innerHTML = '';
    const name = originFeatEffective();
    if (!name) {
        card.innerHTML = '<p class="hint">Selecione um antecedente para definir o talento de origem.</p>';
        return;
    }
    const f = FEATS[name] || {};
    const meta = [f.level ? `Nível ${f.level}+` : '', f.prerequisites ? `Pré-requisito: ${f.prerequisites}` : ''].filter(Boolean).join(' · ');
    const div = document.createElement('div');
    div.className = 'detail-item';
    const strong = document.createElement('strong');
    strong.textContent = name;
    div.appendChild(strong);
    if (meta) {
        const s = document.createElement('span');
        s.className = 'detail-sub';
        s.textContent = meta;
        div.appendChild(s);
    }
    const d = document.createElement('span');
    d.className = 'detail-sub';
    d.textContent = cleanFeatDesc(f.desc || '');
    div.appendChild(d);
    card.appendChild(div);
}

function buildFeatPicker(container, mode, onlyCat) {
    if (!container) return;
    container.innerHTML = '';
    const cats = onlyCat ? [onlyCat] : featCategories();
    cats.forEach((cat, ci) => {
        const feats = Object.entries(FEATS)
            .filter(([, f]) => (f.category || 'Geral') === cat)
            .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
        if (!feats.length) return;
        const block = document.createElement('div');
        block.className = 'feat-cat';
        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'feat-cat-header';
        header.setAttribute('aria-expanded', 'false');
        const title = document.createElement('span');
        title.className = 'feat-cat-title';
        title.textContent = cat;
        const badge = document.createElement('span');
        badge.className = 'feat-cat-count';
        badge.textContent = feats.length + ' talentos';
        header.appendChild(title);
        header.appendChild(badge);
        const list = document.createElement('div');
        list.className = 'feat-cat-list';
        feats.forEach(([name, f]) => list.appendChild(featRow(name, f, mode)));
        if (onlyCat || ci === 0) list.classList.add('open');
        block.appendChild(header);
        block.appendChild(list);
        header.addEventListener('click', () => {
            const open = list.classList.toggle('open');
            header.classList.toggle('open', open);
            header.setAttribute('aria-expanded', String(open));
        });
        container.appendChild(block);
    });
}

function featRow(name, f, mode) {
    const row = document.createElement('label');
    row.className = 'feat-row';
    const input = document.createElement('input');
    input.type = mode === 'originFeat' ? 'radio' : 'checkbox';
    if (mode === 'originFeat') input.name = 'originFeatChoice';
    input.checked = mode === 'originFeat' ? state.originFeat === name : (state.feats || []).includes(name);
    const meta = [f.level ? `Nível ${f.level}+` : '', f.prerequisites ? `Pré-requisito: ${f.prerequisites}` : ''].filter(Boolean).join(' · ');
    const body = document.createElement('span');
    body.className = 'feat-body';
    const n = document.createElement('span');
    n.className = 'feat-name';
    n.textContent = name;
    body.appendChild(n);
    if (meta) {
        const m = document.createElement('span');
        m.className = 'feat-meta';
        m.textContent = meta;
        body.appendChild(m);
    }
    const d = document.createElement('span');
    d.className = 'feat-desc';
    d.textContent = cleanFeatDesc(f.desc || '');
    body.appendChild(d);
    row.appendChild(input);
    row.appendChild(body);
    input.addEventListener('change', () => {
        if (mode === 'originFeat') {
            if (input.checked) {
                state.originFeat = name;
                renderOriginFeatCard();
                buildFeatPicker(document.getElementById('originFeatPicker'), 'originFeat', 'Origem');
            }
        } else {
            handleFeatToggle(name, input.checked);
            renderFeatsChosen();
        }
    });
    return row;
}

function handleFeatToggle(name, checked) {
    let sel = (state.feats || []).slice();
    if (checked) {
        if (!sel.includes(name)) sel.push(name);
    } else {
        sel = sel.filter(f => f !== name);
    }
    state.feats = sel;
}

function removeFeat(name) {
    state.feats = (state.feats || []).filter(f => f !== name);
    buildFeatPicker(document.getElementById('extrasPicker'), 'extras', null);
    renderFeatsChosen();
}

function renderFeatsChosen() {
    const box = document.getElementById('featsChosen');
    if (!box) return;
    box.innerHTML = '';
    box.classList.toggle('empty', !(state.feats || []).length);
    (state.feats || []).forEach(name => {
        const chip = document.createElement('span');
        chip.className = 'feat-chip';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'feat-chip-remove';
        b.setAttribute('data-feat', name);
        b.setAttribute('aria-label', 'Remover ' + name);
        b.textContent = '✕';
        chip.appendChild(document.createTextNode(name + ' '));
        chip.appendChild(b);
        box.appendChild(chip);
    });
}

// =============================================================================
// IDIOMAS
// =============================================================================
function populateLanguages() {
    const s1 = document.getElementById('charLanguages1');
    const s2 = document.getElementById('charLanguages2');
    if (!s1 || !s2) return;
    const chosen = state.languagesChosen || [];
    const options = COMMON_LANGUAGES.filter(l => l !== 'Comum');
    [s1, s2].forEach((el, idx) => {
        el.innerHTML = '';
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = 'Selecione...';
        el.appendChild(ph);
        options.forEach(l => {
            const o = document.createElement('option');
            o.value = l;
            o.textContent = l;
            el.appendChild(o);
        });
        el.value = chosen[idx] || '';
    });
}

function handleLanguagesChange(which) {
    const s1 = document.getElementById('charLanguages1');
    const s2 = document.getElementById('charLanguages2');
    if (!s1 || !s2) return;
    let v1 = s1.value;
    let v2 = s2.value;
    if (v1 && v1 === v2) {
        if (which === 1) {
            s2.value = '';
        } else {
            s1.value = '';
        }
        v1 = s1.value;
        v2 = s2.value;
    }
    state.languagesChosen = [v1, v2].filter(v => v !== '');
}

// =============================================================================
// ATUALIZAÇÃO DE CÁLCULOS
// =============================================================================
function updateAllCalculations() {
    const finalAttrs = getFinalAttributes();
    ATTRIBUTES.forEach(a => {
        const mod = calcModifier(finalAttrs[a]);
        const el = document.querySelector(`#mod-${a}`);
        if (el) el.textContent = formatModifier(mod);
        const fel = document.querySelector(`#final-${a}`);
        if (fel) {
            const base = getBaseAttr(a);
            const bonus = bonusForAttr(a);
            if (base != null) {
                fel.textContent = bonus > 0 ? `${base + bonus} (+${bonus})` : String(base + bonus);
            } else {
                fel.textContent = '—';
            }
        }
    });

    const level = getTotalLevel();
    character.level = level;
    const profBonus = getProficiencyBonus(level);
    const className = document.getElementById('charClass').value;
    const speciesName = document.getElementById('charSpecies').value;
    const armorName = getEquippedArmor();
    const hasShield = hasShieldEquipped();

    // Custo de pontos
    const method = document.getElementById('attrMethod').value;
    const pointsDisplay = document.getElementById('pointsLeft');
    if (method === 'pointbuy') {
        let total = 0;
        ATTRIBUTES.forEach(a => {
            const v = parseInt(document.querySelector(`#attributesGrid input[data-attr="${a}"]`)?.value) || 8;
            total += POINT_COSTS[v] || 0;
        });
        const rem = MAX_POINTS - total;
        pointsDisplay.textContent = `Pontos: ${rem}/${MAX_POINTS}`;
        pointsDisplay.className = 'points-badge' + (rem < 0 ? ' insufficient' : '');
    }

    // CA, PV, Iniciativa, Deslocamento, Proficiencia, Percepcao Passiva
    const dexMod = calcModifier(finalAttrs.des);
    const conMod = calcModifier(finalAttrs.con);
    const sabMod = calcModifier(finalAttrs.sab);
    document.getElementById('summaryCA').textContent = calculateAC(armorName, dexMod, hasShield);
    const classData = CLASSES[className];
    const hp = classData ? calculateMaxHP(getClassLevels(), conMod) : 10 + conMod;
    document.getElementById('summaryHP').textContent = hp;
    document.getElementById('summaryInit').textContent = formatModifier(dexMod);
    const species = SPECIES[speciesName];
    document.getElementById('summarySpeed').textContent = species ? `${species.speed}m` : '9m';
    document.getElementById('summaryProf').textContent = `+${profBonus}`;
    const spp = document.querySelector('#skillsGrid input[data-skill="Percepção"]:checked');
    const hasPerc = !!spp;
    document.getElementById('summaryPassive').textContent = calculatePassivePerception(sabMod, profBonus, hasPerc);

    // Periodicas
    updateSkillModifiers(finalAttrs, profBonus);
    updateSelectedSkillsList();
    renderAttacks();
    renderSpellAttacks();

    // Magias (recalcula à direita sempre que atributos mudam)
    const activeCaster = getActiveCaster();
    if (activeCaster && activeCaster.data.castingStat) {
        renderSpells();
    }
    renderValidation();
}

function updateSkillModifiers(finalAttrs, profBonus) {
    document.querySelectorAll('#skillsGrid input[type="checkbox"]').forEach(cb => {
        const skill = cb.dataset.skill;
        const attr = SKILLS[skill] ? SKILLS[skill].attr : 'for';
        let mod = calcModifier(finalAttrs[attr]);
        if (cb.checked) mod += profBonus;
        document.getElementById(`skill-mod-${cssId(skill)}`).textContent = formatModifier(mod);
    });
}

function updateSelectedSkillsList() {
    const list = document.getElementById('selectedSkillsList');
    list.innerHTML = '';
    getSelectedSkills().forEach(skill => {
        const li = document.createElement('li');
        li.textContent = skill;
        list.appendChild(li);
    });
}

function syncBasicsFromSelects() {
    // sincroniza campos iniciais com o estado
    updateClassInfo();
    updateSpeciesInfo();
    updateBackgroundInfo();
}

// =============================================================================
// EVENTOS
// =============================================================================
function initializeEventListeners() {
    document.getElementById('attrMethod').addEventListener('change', renderAttributes);
    document.getElementById('rollBtn').addEventListener('click', () => {
        state.rollValues = rollScores();
        state.attrValues = {};
        ATTRIBUTES.forEach(a => { state.attrValues[a] = null; });
        ATTRIBUTES.forEach(attr => refreshAttrSelectOptions(attr));
        updateAllCalculations();
    });

    // Delegacao para selects de atributos
    document.getElementById('attributesGrid').addEventListener('change', (e) => {
        if (e.target.matches('select[data-attr]')) {
            handleAttrSelectChange(e.target.dataset.attr);
        }
    });
    document.getElementById('attributesGrid').addEventListener('input', (e) => {
        if (e.target.matches('input[data-attr]')) updateAllCalculations();
    });

    ['charClass', 'charSpecies', 'charBackground'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('change', (e) => {
            document.getElementById('charClass').value;
            if (id === 'charClass') updateClassInfo();
            if (id === 'charSpecies') updateSpeciesInfo();
            if (id === 'charBackground') {
                const oldBg = state.prevBackground;
                const newBg = e.target.value;
                if (oldBg && oldBg !== newBg) {
                    const oldSkills = (BACKGROUNDS[oldBg] && BACKGROUNDS[oldBg].skills) || [];
                    const newSkills = (BACKGROUNDS[newBg] && BACKGROUNDS[newBg].skills) || [];
                    const classData = CLASSES[document.getElementById('charClass').value];
                    const classOpts = (classData && classData.skillOptions) || [];
                    const speciesName = document.getElementById('charSpecies').value;
                    document.querySelectorAll('#skillsGrid input[type="checkbox"]:checked').forEach(cb => {
                        const s = cb.dataset.skill;
                        if (oldSkills.includes(s) && !newSkills.includes(s) &&
                            !classOpts.includes(s) && !speciesSkillAllowed(speciesName, s)) {
                            cb.checked = false;
                        }
                    });
                }
                state.prevBackground = newBg;
                updateBackgroundInfo();
            }
        });
        void el;
    });

    document.getElementById('charSubrace').addEventListener('change', () => {
        renderSpeciesTraits();
    });

    document.getElementById('charSubclass').addEventListener('change', (e) => {
        const c1 = document.getElementById('charClass').value;
        if (c1) state.subclass[c1] = e.target.value;
        renderSubclassInto('subclassFeatures', c1);
    });
    document.getElementById('charSubclass2').addEventListener('change', (e) => {
        if (state.mc.class2) state.subclass[state.mc.class2] = e.target.value;
        renderSubclassInto('subclassFeatures2', state.mc.class2);
    });

    document.getElementById('multiclassToggle').addEventListener('change', (e) => {
        state.mc.enabled = e.target.checked;
        if (!state.mc.enabled) { state.mc.class2 = ''; state.mc.level2 = 1; }
        refreshMulticlassAll();
    });
    document.getElementById('charClass2').addEventListener('change', (e) => {
        state.mc.class2 = e.target.value;
        refreshMulticlassAll();
    });
    document.getElementById('charLevel2').addEventListener('input', (e) => {
        const max = Math.max(1, 20 - getCurrentLevel());
        state.mc.level2 = Math.min(Math.max(1, parseInt(e.target.value) || 1), max);
        e.target.value = state.mc.level2;
        refreshMulticlassAll();
    });

    document.getElementById('asiList').addEventListener('change', (e) => {
        const row = e.target.closest('[data-asi-cls]');
        if (row) handleAsiChange(row);
    });

    document.getElementById('charLevel').addEventListener('input', () => {
        renderClassFeatures();
        refreshSubclasses();
        refreshMulticlassBox();
        renderASI();
        updateAllCalculations();
    });

    // Descricoes recolhíveis (passo Classe/Especie/Antecedente)
    document.querySelectorAll('.collapse-header').forEach(btn => {
        btn.addEventListener('click', () => {
            const box = btn.closest('.collapse-box');
            const open = box.classList.toggle('open');
            btn.setAttribute('aria-expanded', String(open));
        });
    });

    // Periodicas
    document.getElementById('freeSkillsToggle').addEventListener('change', (e) => {
        state.freeSkills = e.target.checked;
        updateSkillsAvailability();
    });

    document.getElementById('skillsGrid').addEventListener('change', (e) => {
        if (e.target.matches('input[type="checkbox"][data-skill]')) {
            const cb = e.target;
            if (cb.checked) {
                const classData = CLASSES[document.getElementById('charClass').value];
                const bgData = BACKGROUNDS[document.getElementById('charBackground').value];
                const bgSkills = (bgData && bgData.skills) || [];
                const classOpts = (classData && classData.skillOptions) || [];
                const speciesName = document.getElementById('charSpecies').value;
                let allowed = true;
                if (!state.freeSkills && classData && !bgSkills.includes(cb.dataset.skill)) {
                    if (classOpts.includes(cb.dataset.skill)) {
                        const checkedClass = getSelectedSkills().filter(s => classOpts.includes(s) && !bgSkills.includes(s));
                        if (checkedClass.length > classData.skillsCount) allowed = false;
                    } else {
                        const freeUsed = getSelectedSkills().filter(s => !classOpts.includes(s) && !bgSkills.includes(s)).length;
                        if (!speciesSkillAllowed(speciesName, cb.dataset.skill) || freeUsed > speciesFreeMax(speciesName)) allowed = false;
                    }
                }
                if (!allowed) {
                    cb.checked = false;
                    updateSkillsAvailability();
                    return;
                }
            }
            updateSkillsAvailability();
        }
    });

    // Equipamento
    document.getElementById('addItemBtn').addEventListener('click', addItem);
    ['classEquipmentChoices', 'bgEquipmentChoices'].forEach(id => {
        document.getElementById(id).addEventListener('click', (e) => {
            const btn = e.target.closest('.choice-card');
            if (btn && typeof btn.onclick === 'function') btn.onclick();
        });
    });

    // Magias
    document.getElementById('spellsColumns').addEventListener('change', (e) => {
        if (e.target.matches('input[data-attack-card]')) {
            toggleSpellAttackCard(e.target.dataset.attackCard, e.target.dataset.spellKey, e.target.checked);
        } else if (e.target.matches('input[data-spell-key]')) {
            handleSpellToggle(e.target);
            updateSpellSummaries();
        }
    });
    document.getElementById('spellsChosen').addEventListener('click', (e) => {
        const btn = e.target.closest('.feat-chip-remove');
        if (btn) removeSpell(btn.dataset.spellKey, btn.dataset.spell);
    });

    // Talentos (origem por padrão + regras caseiras)
    document.getElementById('originSwapToggle').addEventListener('change', (e) => {
        state.originSwap = e.target.checked;
        if (state.originSwap && !state.originFeat) state.originFeat = backgroundOriginFeatName();
        if (!state.originSwap) state.originFeat = '';
        renderFeats();
    });
    document.getElementById('extraAllowedToggle').addEventListener('change', (e) => {
        state.extraAllowed = e.target.checked;
        renderFeats();
    });
    document.getElementById('featsChosen').addEventListener('click', (e) => {
        const btn = e.target.closest('.feat-chip-remove');
        if (btn) removeFeat(btn.dataset.feat);
    });

    // Idiomas
    document.getElementById('charLanguages1').addEventListener('change', () => handleLanguagesChange(1));
    document.getElementById('charLanguages2').addEventListener('change', () => handleLanguagesChange(2));

    // Exportar / salvar
    document.getElementById('exportFoundry').addEventListener('click', exportFoundryVTT);
    document.getElementById('exportPDF').addEventListener('click', exportPDF);
    document.getElementById('previewPrint').addEventListener('click', previewPrint);
    document.getElementById('saveCharacter').addEventListener('click', saveCharacter);
    document.getElementById('loadCharacter').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', loadCharacter);
    document.getElementById('undoBtn').addEventListener('click', doUndo);
    document.getElementById('redoBtn').addEventListener('click', doRedo);
    // navbar: menu Fichas + modal Sobre
    const fichasBtn = document.getElementById('fichasBtn');
    const fichasMenu = document.getElementById('fichasMenu');
    if (fichasBtn && fichasMenu) {
        fichasBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fichasMenu.hidden = !fichasMenu.hidden;
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-dropdown')) fichasMenu.hidden = true;
        });
        fichasMenu.addEventListener('click', (e) => {
            if (e.target.closest('button')) fichasMenu.hidden = true;
        });
    }
    const aboutBtn = document.getElementById('aboutBtn');
    const aboutModal = document.getElementById('aboutModal');
    const aboutClose = document.getElementById('aboutClose');
    if (aboutBtn && aboutModal) {
        aboutBtn.addEventListener('click', () => { aboutModal.hidden = false; });
        if (aboutClose) aboutClose.addEventListener('click', () => { aboutModal.hidden = true; });
        aboutModal.addEventListener('click', (e) => {
            if (e.target === aboutModal) aboutModal.hidden = true;
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !aboutModal.hidden) aboutModal.hidden = true;
        });
    }
    // histórico: qualquer mudança (com debounce + dedup) vira um ponto de undo
    document.addEventListener('change', () => scheduleHistoryPush());
    document.addEventListener('click', () => scheduleHistoryPush());
    document.addEventListener('input', () => scheduleHistoryPush());
    document.getElementById('attackSpellsList').addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset && t.dataset.cardField && t.dataset.spell) {
            const c = state.spellAttackCards[t.dataset.spell];
            if (c) c[t.dataset.cardField] = t.value;
        }
    });
    document.getElementById('attacksList').addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset && t.dataset.attackObs !== undefined) {
            state.attackObs[t.dataset.attackObs] = t.value;
        }
    });
    initImageUploads();
}

// =============================================================================
// IMAGENS (Token + Corpo inteiro), ATAQUES, MAGIAS DE ATAQUE
// =============================================================================
function setUploadPreview(boxId, placeholderId, previewId, dataURL) {
    const placeholder = document.getElementById(placeholderId);
    const preview = document.getElementById(previewId);
    if (!placeholder || !preview) return;
    if (dataURL) {
        preview.src = dataURL;
        preview.hidden = false;
        placeholder.style.display = 'none';
    } else {
        preview.removeAttribute('src');
        preview.hidden = true;
        placeholder.style.display = '';
    }
}

function readImageFile(file, cb) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) return;
    const reader = new FileReader();
    reader.onload = e => cb(e.target.result);
    reader.readAsDataURL(file);
}

function closeLightboxOnEsc(e) { if (e.key === 'Escape') closeLightbox(); }

function closeLightbox() {
    const overlay = document.getElementById('lightboxOverlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', closeLightboxOnEsc);
}

function openLightbox(src, fileInput) {
    closeLightbox();
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.id = 'lightboxOverlay';
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Imagem ampliada';
    overlay.appendChild(img);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lightbox-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Fechar';
    overlay.appendChild(closeBtn);
    const bar = document.createElement('div');
    bar.className = 'lightbox-bar';
    const swapBtn = document.createElement('button');
    swapBtn.type = 'button';
    swapBtn.className = 'btn btn-gold';
    swapBtn.textContent = 'Trocar imagem';
    swapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeLightbox();
        if (fileInput) fileInput.click();
    });
    bar.appendChild(swapBtn);
    overlay.appendChild(bar);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target === closeBtn) closeLightbox();
    });
    document.addEventListener('keydown', closeLightboxOnEsc);
    document.body.appendChild(overlay);
}

function wireImageUpload(boxId, inputId, placeholderId, previewId, get, set) {
    const box = document.getElementById(boxId);
    const input = document.getElementById(inputId);
    if (!box || !input) return;
    box.addEventListener('click', () => {
        if (get()) openLightbox(get(), input);
        else input.click();
    });
    input.addEventListener('change', () => {
        readImageFile(input.files[0], (dataURL) => {
            set(dataURL);
            setUploadPreview(boxId, placeholderId, previewId, dataURL);
        });
        input.value = '';
    });
}

function initImageUploads() {
    wireImageUpload('tokenUpload', 'tokenFile', 'tokenPlaceholder', 'tokenPreview',
        () => state.tokenImg, v => { state.tokenImg = v; });
    wireImageUpload('fullBodyUpload', 'fullBodyFile', 'fullBodyPlaceholder', 'fullBodyPreview',
        () => state.fullBodyImg, v => { state.fullBodyImg = v; });
    setUploadPreview('tokenUpload', 'tokenPlaceholder', 'tokenPreview', state.tokenImg);
    setUploadPreview('fullBodyUpload', 'fullBodyPlaceholder', 'fullBodyPreview', state.fullBodyImg);
}

function attackCell(label, valueNode, span) {
    const cell = document.createElement('div');
    cell.className = 'attack-cell';
    if (span) cell.style.gridColumn = `span ${span}`;
    const kk = document.createElement('span');
    kk.className = 'k';
    kk.textContent = label;
    cell.appendChild(kk);
    cell.appendChild(valueNode);
    return cell;
}

function attackValue(text, big) {
    const vv = document.createElement('span');
    vv.className = 'v' + (big ? ' attack-big' : '');
    vv.textContent = text;
    return vv;
}

function weaponObsInput(name) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'attack-field';
    inp.value = (state.attackObs && state.attackObs[name]) || '';
    inp.dataset.attackObs = name;
    inp.placeholder = '—';
    return inp;
}

function weaponAttackCard(name) {
    const w = WEAPONS[name] || {};
    const finalAttrs = getFinalAttributes();
    const prof = getProficiencyBonus(getTotalLevel());
    const ab = weaponAttackAbility(name);
    const mod = calcModifier(finalAttrs[ab]);
    const card = document.createElement('div');
    card.className = 'attack-card';
    const grid = document.createElement('div');
    grid.className = 'attack-grid';
    grid.appendChild(attackCell('Nome', attackValue(name, true), 3));
    grid.appendChild(attackCell('Ataque', attackValue(formatModifier(prof + mod), true), 3));
    grid.appendChild(attackCell('Dano', attackValue(w.damage ? `${w.damage}${formatModifier(mod)}` : '—', true), 3));
    grid.appendChild(attackCell('Tipo de dano', attackValue(w.type || '—'), 3));
    grid.appendChild(attackCell('Maestria', attackValue(w.mastery || '—'), 4));
    grid.appendChild(attackCell('Alcance', attackValue(weaponRangeText(name)), 4));
    grid.appendChild(attackCell('Propriedades', attackValue((w.properties || []).join(', ') || '—'), 4));
    grid.appendChild(attackCell('OBS', weaponObsInput(name), 12));
    card.appendChild(grid);
    return card;
}

function weaponAttackAbility(name) {
    const w = WEAPONS[name];
    const finalAttrs = getFinalAttributes();
    if (w) {
        const props = w.properties || [];
        const finesse = props.some(p => p === 'Acuidade' || String(p).indexOf('Acuidade') === 0);
        if (finesse) {
            return calcModifier(finalAttrs.des) >= calcModifier(finalAttrs.for) ? 'des' : 'for';
        }
        if ((w.category || '').indexOf('Distancia') !== -1) return 'des';
    }
    return 'for';
}

function weaponRangeText(name) {
    const w = WEAPONS[name];
    if (!w) return '—';
    const props = w.properties || [];
    const r = props.find(p => /alcance/i.test(p));
    if (r) {
        const m = r.match(/alcance\s+([^;)]+)/i);
        if (m) return m[1].trim();
        return r;
    }
    if ((w.category || '').indexOf('Distancia') !== -1) return 'À distância';
    return 'Corpo a corpo';
}

function renderAttacks() {
    const box = document.getElementById('attacksList');
    if (!box) return;
    box.innerHTML = '';
    const weapons = getEquippedWeapons();
    if (!weapons.length) {
        const p = document.createElement('p');
        p.className = 'attacks-empty';
        p.textContent = 'Nenhuma arma equipada.';
        box.appendChild(p);
        return;
    }
    weapons.forEach(name => {
        box.appendChild(weaponAttackCard(name));
    });
}

const SPELL_DAMAGE_TYPES = ['Contundente', 'Cortante', 'Perfurante', 'Ácido',
    'Frio', 'Gélido', 'Gelo', 'Ígneo', 'Fogo', 'Elétrico', 'Venenoso', 'Necrótico',
    'Radiante', 'Psíquico', 'Trovão', 'Trovejante', 'Força', 'Energético'];

function spellDamageType(spell) {
    const desc = String((spell && spell.desc) || '');
    const m = desc.match(/dano ([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)/);
    if (m && SPELL_DAMAGE_TYPES.includes(m[1])) return m[1];
    return '';
}

function spellCircleLabel(key) {
    if (key === 'cantrips') return 'Truque';
    const n = parseInt(String(key).replace('lvl', ''), 10);
    return isNaN(n) ? key : `${n}º círculo`;
}

function spellAttackInput(name, field, value, big) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'attack-field' + (big ? ' attack-big' : '');
    inp.value = value || '';
    inp.dataset.spell = name;
    inp.dataset.cardField = field;
    return inp;
}

function renderSpellAttacks() {
    const box = document.getElementById('attackSpellsList');
    if (!box) return;
    box.innerHTML = '';
    const names = Object.keys(state.spellAttackCards || {}).filter(n => state.spellAttackCards[n].enabled);
    if (!names.length) {
        const p = document.createElement('p');
        p.className = 'attacks-empty';
        p.textContent = 'Marque "Acrescentar card de ataque" numa magia para criar seu card.';
        box.appendChild(p);
        return;
    }
    // [rótulo, campo, colunas, grande, editável]
    const spec = [
        ['Nome', 'nome', 4, true, true],
        ['Círculo', 'circulo', 4, false, true],
        ['Escola', 'escola', 4, false, true],
        ['Ação', 'acao', 4, false, true],
        ['Alcance', 'alcance', 4, false, true],
        ['Duração', 'duracao', 4, false, true],
        ['Ataque', 'ataque', 6, true, true],
        ['CD', 'cd', 6, false, true],
        ['Dano', 'dano', 6, true, true],
        ['Tipo de dano', 'tipo', 6, false, true],
        ['OBS', 'obs', 12, false, true]
    ];
    names.forEach(name => {
        const data = state.spellAttackCards[name];
        const card = document.createElement('div');
        card.className = 'attack-card spell-attack-card';
        const grid = document.createElement('div');
        grid.className = 'attack-grid';
        spec.forEach(([label, field, span, big]) => {
            const inp = spellAttackInput(name, field, data[field], big);
            grid.appendChild(attackCell(label, inp, span));
        });
        card.appendChild(grid);
        box.appendChild(card);
    });
}

// =============================================================================
// EXPORTAÇÃO
// =============================================================================
function updateCharacterData() {
    const finalAttrs = getFinalAttributes();

    character.name = document.getElementById('charName').value;
    character.level = getTotalLevel() || 1;
    character.className = document.getElementById('charClass').value;
    character.classLevel = getCurrentLevel();
    character.class2 = (state.mc && state.mc.enabled) ? (state.mc.class2 || '') : '';
    character.level2 = (state.mc && state.mc.enabled && state.mc.class2) ? Math.max(1, state.mc.level2 || 1) : 0;
    character.mcEnabled = !!(state.mc && state.mc.enabled && character.class2);
    character.subclass = Object.assign({}, state.subclass);
    character.asi = JSON.parse(JSON.stringify(state.asi || []));
    character.species = document.getElementById('charSpecies').value;
    character.subrace = getChosenSubrace();
    character.background = document.getElementById('charBackground').value;
    character.alignment = document.getElementById('charAlignment').value;
    character.attributes = finalAttrs;
    character.armor = getEquippedArmor();
    character.weapons = getEquippedWeapons();
    character.weapon = character.weapons[0] || '';
    character.hasShield = hasShieldEquipped();
    character.skillsProf = getSelectedSkills();
    character.bgSkills = BACKGROUNDS[character.background] ? (BACKGROUNDS[character.background].skills || []) : [];
    character.attributeMethod = document.getElementById('attrMethod').value;

    // atributos base puros
    character.baseAttributes = {};
    ATTRIBUTES.forEach(a => character.baseAttributes[a] = getBaseAttr(a));
    character.bonusAttrs = (state.bonusAttrs || []).slice();

    character.classEquipSel = state.classEquipSel;
    character.bgEquipSel = state.bgEquipSel;
    character.extraEquipment = [...state.extraEquipment];
    character.equipment = geEquipmentList();
    const equippedSet = new Set(state.equipped);
    character.inventory = getInventoryEntries().map(e => ({
        name: e.name,
        qty: e.qty,
        raw: e.raw,
        catalog: e.catalog,
        kind: e.kind || (e.catalog ? 'item' : 'other'),
        equipped: e.catalog ? equippedSet.has(e.name) : false,
        detail: e.moneyText || inventoryItemDetail(e)
    }));
    character.spells = {};
    character.spells.cantrips = (state.spells.cantrips || []).slice();
    for (let k = 1; k <= 9; k++) character.spells[`lvl${k}`] = (state.spells[`lvl${k}`] || []).slice();

    character.feats = (state.feats || []).slice();
    character.originSwap = state.originSwap;
    character.originFeat = state.originFeat;
    character.extraAllowed = state.extraAllowed;
    character.freeSkills = state.freeSkills;
    character.featsDisplay = displayFeats(character);
    character.featsHomebrew = document.getElementById('featsHomebrew').value.trim();

    character.personality = document.getElementById('personality').value;
    character.ideals = document.getElementById('ideals').value;
    character.bonds = document.getElementById('bonds').value;
    character.flaws = document.getElementById('flaws').value;
    character.notes = document.getElementById('notes').value;
    character.languages = languageList(character.species, character.background);
    character.money = coinBreakdown(moneyRemaining());
    character.tokenImg = state.tokenImg || '';
    character.fullBodyImg = state.fullBodyImg || '';
    character.attackObs = Object.assign({}, state.attackObs);
    character.spellAttackCards = JSON.parse(JSON.stringify(state.spellAttackCards || {}));
}

function languageList(speciesName, bgName) {
    const set = new Set(['Comum']);
    (state.languagesChosen || []).forEach(l => set.add(l));
    return [...set];
}

function featFromBackgroundName(bgName) {
    const bg = BACKGROUNDS[bgName];
    if (!bg || !bg.feat) return '';
    if (FEATS[bg.feat]) return bg.feat;
    const base = bg.feat.replace(/ \(.*\)$/, '').trim();
    return FEATS[base] ? base : bg.feat;
}

function displayFeats(ch) {
    const out = [];
    const origin = ch.originSwap ? (ch.originFeat || '') : featFromBackgroundName(ch.background);
    if (origin) out.push(origin);
    if (ch.extraAllowed) (ch.feats || []).forEach(f => { if (!out.includes(f)) out.push(f); });
    ((ch.asi || state.asi) || []).forEach(e => {
        if (e.kind === 'feat' && e.feat && !out.includes(e.feat)) out.push(e.feat);
    });
    return out;
}

function savingThrowsForClass(className) {
    const classData = CLASSES[className];
    return classData ? (classData.savingThrows || []) : [];
}

function exportFoundryVTT() {
    updateCharacterData();
    const ch = character;
    // ---- Mapas PT-BR -> códigos dnd5e 6.x ----
    const FOUNDRY_ATTR = { for: 'str', des: 'dex', con: 'con', int: 'int', sab: 'wis', car: 'cha' };
    const FOUNDRY_DMG = {
        'Cortante': 'slashing', 'Perfurante': 'piercing', 'Contundente': 'bludgeoning',
        'Ácido': 'acid', 'Frio': 'cold', 'Gélido': 'cold', 'Ígneo': 'fire',
        'Elétrico': 'lightning', 'Necrótico': 'necrotic', 'Venenoso': 'poison',
        'Psíquico': 'psychic', 'Radiante': 'radiant', 'Trovão': 'thunder',
        'Trovejante': 'thunder', 'Força': 'force', 'Energético': 'force'
    };
    // apelidos em minúsculo sem acento (nomes comuns que o usuário pode digitar)
    const DMG_ALIAS = {
        'cortante': 'slashing', 'perfurante': 'piercing', 'contundente': 'bludgeoning',
        'acido': 'acid', 'frio': 'cold', 'gelido': 'cold', 'gelo': 'cold',
        'igneo': 'fire', 'fogo': 'fire', 'eletrico': 'lightning', 'eletricidade': 'lightning',
        'necrotico': 'necrotic', 'venenoso': 'poison', 'veneno': 'poison',
        'psiquico': 'psychic', 'radiante': 'radiant', 'trovao': 'thunder',
        'trovejante': 'thunder', 'forca': 'force', 'energetico': 'force'
    };
    const dmgCode = (word) => {
        if (!word) return '';
        const norm = String(word).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return DMG_ALIAS[norm] || FOUNDRY_DMG[word] || '';
    };
    const FOUNDRY_PROP = {
        'Acuidade': 'fin', 'Leve': 'lgt', 'Pesada': 'hvy', 'Duas Mãos': 'two',
        'Versátil': 'ver', 'Arremesso': 'thr', 'Munição': 'amm', 'Recarga': 'lod', 'Extensão': 'rch'
    };
    const FOUNDRY_MASTERY = {
        'Ágil': 'vex', 'Lentidão': 'slow', 'Derrubar': 'topple', 'Empurrar': 'push',
        'Drenar': 'sap', 'Afligir': 'graze', 'Trespassar': 'cleave', 'Garantido': 'nick'
    };
    const FOUNDRY_WTYPE = {
        'Armas Simples Corpo a Corpo': 'simpleM', 'Armas Simples a Distancia': 'simpleR',
        'Armas Marciais Corpo a Corpo': 'martialM', 'Armas Marciais a Distancia': 'martialR'
    };
    const FOUNDRY_SCHOOL = {
        'Abjuração': 'abj', 'Adivinhação': 'div', 'Conjuração': 'con', 'Encantamento': 'enc',
        'Evocação': 'evo', 'Ilusão': 'ill', 'Necromancia': 'nec', 'Transmutação': 'trs'
    };
    const FOUNDRY_SIZE = {
        'Minúsculo': 'tiny', 'Pequeno': 'sm', 'Médio': 'med',
        'Grande': 'lg', 'Enorme': 'huge', 'Colossal': 'grg'
    };
    const FOUNDRY_LANG = {
        'Comum': 'common', 'Dracônico': 'draconic', 'Anão': 'dwarvish', 'Élfico': 'elvish',
        'Gigante': 'giant', 'Gnômico': 'gnomish', 'Goblin': 'goblin', 'Pequenino': 'halfling',
        'Orc': 'orc', 'Abissal': 'abyssal', 'Celestial': 'celestial', 'Infernal': 'infernal',
        'Primordial': 'primordial', 'Silvestre': 'sylvan', 'Subcomum': 'undercommon', 'Druídico': 'druidic'
    };
    const FOUNDRY_COIN = { 'PO': 'gp', 'PP': 'sp', 'PC': 'cp', 'PE': 'pp' };
    const blankRoll = () => ({ min: null, max: null, mode: 0 });
    const slugify = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const mToFt = (m) => { const v = parseFloat(m); return isNaN(v) ? null : Math.round(v * 3.28084 / 5) * 5; };
    const foundryId = () => {
        const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let s = '';
        for (let i = 0; i < 16; i++) s += c[Math.floor(Math.random() * c.length)];
        return s;
    };
    const fSource = { custom: 'Criador de Fichas D&D 5.5' };
    const parseDice = (str) => {
        const m = String(str || '').match(/(\d+)d(\d+)/);
        return m ? { number: parseInt(m[1], 10), denomination: parseInt(m[2], 10) } : null;
    };
    const parseCost = (str) => {
        const m = String(str || '').match(/([\d.,]+)\s*([A-Za-z]*)/);
        if (!m) return { value: 0, denomination: 'gp' };
        return { value: parseFloat(m[1].replace(',', '.')) || 0, denomination: FOUNDRY_COIN[m[2].toUpperCase()] || 'gp' };
    };
    const parseWeightLb = (str) => {
        if (!str || str === '—') return 0;
        const m = String(str).replace(',', '.').match(/([\d.]+)/);
        return m ? Math.round(parseFloat(m[1]) * 2.20462 * 10) / 10 : 0;
    };

    // Habilidades no modelo v14/dnd5e 6.x
    const saveAttrs = savingThrowsForClass(ch.className);
    const abilities = {};
    ATTRIBUTES.forEach(attr => {
        abilities[FOUNDRY_ATTR[attr]] = {
            value: ch.attributes[attr],
            proficient: saveAttrs.includes(attr) ? 1 : 0,
            max: null,
            attack: { roll: blankRoll() },
            check: { roll: blankRoll() },
            save: { roll: blankRoll() }
        };
    });

    // Perícias no modelo v14/dnd5e 6.x (value 0/1)
    const skills = {};
    Object.keys(SKILLS).forEach(pt => {
        const code = FOUNDRY_SKILL[pt];
        if (!code) return;
        skills[code] = {
            ability: FOUNDRY_ATTR[SKILLS[pt].attr] || 'str',
            roll: blankRoll(),
            bonuses: { passive: '' },
            value: ch.skillsProf.includes(pt) ? 1 : 0
        };
    });

    // ---- Construtores de itens embutidos ----
    const weaponRangeFt = (name) => {
        const w = WEAPONS[name] || {};
        const props = w.properties || [];
        const r = props.find(p => /alcance/i.test(p));
        if (r) {
            const m = r.match(/alcance\s+([\d.,]+)\/([\d.,]+)/i);
            if (m) {
                return {
                    value: mToFt(m[1].replace(',', '.')), long: mToFt(m[2].replace(',', '.')),
                    units: 'ft', reach: null
                };
            }
        }
        const reach = props.some(p => p === 'Extensão' || String(p).indexOf('Extensão') === 0);
        return { value: reach ? 10 : 5, long: null, units: 'ft', reach: reach ? 10 : null };
    };
    const weaponPropsEn = (name) => {
        const w = WEAPONS[name] || {};
        return (w.properties || [])
            .map(p => FOUNDRY_PROP[String(p).split(' (')[0]] || null)
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i);
    };
    const buildWeaponItem = (name, qty, equipped, detail) => {
        const w = WEAPONS[name] || {};
        const base = parseDice(w.damage) || { number: 1, denomination: 6 };
        const verProp = (w.properties || []).find(p => String(p).indexOf('Versátil') === 0);
        const ver = verProp ? parseDice(verProp) : null;
        const cost = parseCost(w.cost);
        return {
            _id: foundryId(), name, type: 'weapon', img: '',
            system: {
                description: { value: detail || '' }, source: fSource,
                price: cost, quantity: qty || 1,
                weight: { value: parseWeightLb(w.weight), units: 'lb' },
                range: weaponRangeFt(name),
                damage: {
                    base: {
                        number: base.number, denomination: base.denomination,
                        types: [FOUNDRY_DMG[w.type] || 'slashing'], bonus: '', custom: { enabled: false }, modifiers: []
                    },
                    versatile: ver ? {
                        number: ver.number, denomination: ver.denomination,
                        bonus: '', types: [FOUNDRY_DMG[w.type] || 'slashing'], custom: { enabled: false }, modifiers: []
                    } : { number: null, denomination: null, bonus: '', types: [], custom: { enabled: false }, modifiers: [] }
                },
                type: { value: FOUNDRY_WTYPE[w.category] || 'simpleM' },
                properties: weaponPropsEn(name),
                mastery: FOUNDRY_MASTERY[w.mastery] || '',
                identifier: slugify(name),
                equipped: !!equipped, proficient: null, attunement: ''
            }
        };
    };
    const buildArmorItem = (name, qty, equipped, detail) => {
        const a = ARMORS[name] || {};
        const cost = parseCost(a.cost);
        let armorType = 'clothing';
        if (name === 'Escudo') armorType = 'shield';
        else if ((a.category || '').indexOf('Leve') !== -1) armorType = 'light';
        else if ((a.category || '').indexOf('dia') !== -1) armorType = 'medium';
        else if ((a.category || '').indexOf('Pesada') !== -1) armorType = 'heavy';
        return {
            _id: foundryId(), name, type: 'equipment', img: '',
            system: {
                description: { value: detail || '' }, source: fSource,
                price: cost, quantity: qty || 1,
                weight: { value: parseWeightLb(a.weight), units: 'lb' },
                armor: { value: name === 'Escudo' ? 2 : (a.caBase || 10) },
                type: { value: armorType },
                identifier: slugify(name),
                equipped: !!equipped, attunement: ''
            }
        };
    };
    const buildLootItem = (entry) => {
        const cost = parseCost(entry.raw && entry.raw.cost);
        return {
            _id: foundryId(), name: entry.name, type: 'loot', img: '',
            system: {
                description: { value: entry.detail || '' }, source: fSource,
                price: cost, quantity: entry.qty || 1,
                weight: { value: parseWeightLb(entry.raw && entry.raw.weight), units: 'lb' },
                identifier: slugify(entry.name)
            }
        };
    };
    const parseSpellRange = (txt) => {
        const t = String(txt || '');
        if (/toque/i.test(t)) return { value: null, units: 'touch' };
        if (/pessoal|pr[oó]prio/i.test(t)) return { value: null, units: 'self' };
        let m = t.match(/([\d.,]+)\s*metros?/i);
        if (m) return { value: mToFt(m[1].replace(',', '.')), units: 'ft' };
        m = t.match(/([\d.,]+)\s*(km|quil[oô]metros?)/i);
        if (m) return { value: parseFloat(m[1].replace(',', '.')), units: 'km' };
        m = t.match(/([\d.,]+)\s*(milhas?|mi\b)/i);
        if (m) return { value: parseFloat(m[1].replace(',', '.')), units: 'mi' };
        return { value: null, units: 'spec' };
    };
    const parseSpellDuration = (txt) => {
        const t = String(txt || '');
        const conc = /concentra/i.test(t);
        if (/instant/i.test(t)) return { value: null, units: 'inst', concentration: conc };
        let m = t.match(/(\d+)\s*minutos?/i);
        if (m) return { value: parseInt(m[1], 10), units: 'minute', concentration: conc };
        m = t.match(/(\d+)\s*horas?/i);
        if (m) return { value: parseInt(m[1], 10), units: 'hour', concentration: conc };
        m = t.match(/(\d+)\s*dias?/i);
        if (m) return { value: parseInt(m[1], 10), units: 'day', concentration: conc };
        m = t.match(/(\d+)\s*(turnos?|rodadas?)/i);
        if (m) return { value: parseInt(m[1], 10), units: /rodada/i.test(t) ? 'round' : 'turn', concentration: conc };
        if (/permanente|dissipada|desfeita/i.test(t)) return { value: null, units: 'perm', concentration: conc };
        return { value: null, units: 'spec', concentration: conc };
    };
    const parseSpellActivation = (txt) => {
        const t = String(txt || '');
        if (/b[oô]nus/i.test(t)) return { type: 'bonus', value: 1 };
        if (/rea[cç][aã]o/i.test(t)) return { type: 'reaction', value: 1 };
        let m = t.match(/(\d+)\s*minutos?/i);
        if (m) return { type: 'minute', value: parseInt(m[1], 10) };
        m = t.match(/(\d+)\s*horas?/i);
        if (m) return { type: 'hour', value: parseInt(m[1], 10) };
        if (/a[cç][aã]o/i.test(t)) return { type: 'action', value: 1 };
        return { type: 'special', value: 0 };
    };
    const buildSpellItem = (spellName) => {
        const s = SPELLS.find(x => x.name === spellName) || {};
        const card = state.spellAttackCards && state.spellAttackCards[spellName];
        const custom = card && card.enabled ? card : null;
        const eff = (v, fb) => {
            const t = v != null ? String(v).trim() : '';
            return t || (fb != null ? String(fb) : '');
        };
        const schoolTxt = custom ? eff(custom.escola, s.school) : (s.school || '');
        const schoolCode = FOUNDRY_SCHOOL[schoolTxt] ||
            (Object.values(FOUNDRY_SCHOOL).includes(schoolTxt.toLowerCase()) ? schoolTxt.toLowerCase() : null) ||
            FOUNDRY_SCHOOL[s.school] || 'evo';
        let level = s.level != null ? s.level : 1;
        if (custom) {
            const ct = String(custom.circulo || '');
            if (/truque/i.test(ct)) level = 0;
            else {
                const m = ct.match(/(\d+)/);
                if (m) level = parseInt(m[1], 10);
            }
        }
        const sys = {
            description: { value: s.desc || '' }, source: fSource,
            level, school: schoolCode
        };
        if (custom) {
            sys.activation = parseSpellActivation(eff(custom.acao, s.castingTime));
            sys.range = parseSpellRange(eff(custom.alcance, s.range));
            sys.duration = parseSpellDuration(eff(custom.duracao, s.duration));
            const desc = String(s.desc || '');
            const hasAtk = /ataque m[aá]gico|jogada de ataque/i.test(desc);
            if (hasAtk && /corpo a corpo/i.test(desc)) sys.actionType = 'msak';
            else if (hasAtk) sys.actionType = 'rsak';
            else if (/salvaguarda/i.test(desc)) sys.actionType = 'save';
            const formula = String(custom.dano || '').replace(/\s+/g, '');
            if (/^\d+d\d+([+-]\d+)?$/i.test(formula)) {
                const tipoTxt = String(custom.tipo || '').trim();
                let dtype = dmgCode(tipoTxt);
                if (!dtype) {
                    const dmgWord = String(s.desc || '').match(/dano ([A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]+)/);
                    dtype = (dmgWord && dmgCode(dmgWord[1])) || '';
                }
                sys.damage = { parts: [[formula, dtype]] };
            }
        }
        return {
            _id: foundryId(),
            name: custom ? (eff(custom.nome, spellName) || spellName) : spellName,
            type: 'spell', img: '', system: sys
        };
    };
    const buildFeatItem = (featName, featDesc) => {
        const f = FEATS[featName] || {};
        return {
            _id: foundryId(), name: featName, type: 'feat', img: '',
            system: {
                description: { value: featDesc || f.desc || '' }, source: fSource,
                type: { value: (f.category === 'Origem') ? 'background' : 'general' },
                requirements: f.prerequisites || ''
            }
        };
    };

    const classData = CLASSES[ch.className];
    const chLevels = [];
    if (ch.className && CLASSES[ch.className]) {
        chLevels.push({ key: ch.className, data: CLASSES[ch.className], level: ch.classLevel || ch.level });
    }
    if (ch.mcEnabled && ch.class2 && CLASSES[ch.class2]) {
        chLevels.push({ key: ch.class2, data: CLASSES[ch.class2], level: ch.level2 });
    }
    const classLine = chLevels.length
        ? chLevels.map(e => `${(e.data && e.data.name) || e.key} ${e.level}`).join(' / ')
        : '-';
    const featuresFiltered = getFeaturesUpToLevel(classData, ch.classLevel || ch.level);
    const featuresText = featuresFiltered
        ? featuresFiltered.map(f => `${f.name}: ${f.desc}`).join('\n') : '';
    const classData2 = (ch.mcEnabled && ch.class2) ? CLASSES[ch.class2] : null;
    const featuresText2 = classData2
        ? (getFeaturesUpToLevel(classData2, ch.level2) || []).map(f => `${f.name}: ${f.desc}`).join('\n') : '';
    const subText1 = ch.className ? subclassSectionsText(ch.className, ch.classLevel || ch.level) : '';
    const subText2 = (ch.mcEnabled && ch.class2) ? subclassSectionsText(ch.class2, ch.level2) : '';
    const subName1 = ch.className && (ch.subclass || {})[ch.className];
    const subName2 = (ch.mcEnabled && ch.class2 && (ch.subclass || {})[ch.class2]) || '';
    const traitsText = (SPECIES[ch.species])
        ? speciesTraitsFor(ch.species, ch.subrace).map(t => `${t.name}: ${t.desc}`).join('\n') : '';
    const featText = displayFeats(ch).join(', ') +
        (ch.featsHomebrew ? (displayFeats(ch).length ? '; ' : '') + ch.featsHomebrew : '');
    const spellsText = spellLines(ch).map(l => `  ${l}`).join('\n');

    const biographyValue = [
        `Classe: ${classLine}${subName1 ? ` (${subName1})` : ''}${subName2 ? ` / ${subName2}` : ''}`,
        `Espécie: ${ch.species}${ch.subrace ? ' (' + ch.subrace + ')' : ''} | Antecedente: ${ch.background}`,
        '',
        '== Habilidades de Classe ==', featuresText,
        subText1 ? `\n== Subclasse (${subName1 || ch.className}) ==\n${subText1}` : '',
        featuresText2 ? `\n== Habilidades (2ª classe) ==\n${featuresText2}` : '',
        subText2 ? `\n== Subclasse 2 (${subName2 || ch.class2}) ==\n${subText2}` : '',
        '', '== Traços de Espécie ==', traitsText,
        '', `== Talentos ==`, featText || '-',
        '', '== Equipamento ==',
        (ch.inventory.length ? ch.inventory.map(e =>
            `${e.name}${e.qty > 1 ? ' (×' + e.qty + ')' : ''}${e.equipped ? ' [equipado]' : ''}${e.detail ? ' — ' + e.detail : ''}`
        ).join('\n') : ch.equipment.join(', ')),
        '', '== Magias ==',
        spellsText || '-',
        '',
        `Personalidade: ${ch.personality}\nIdeais: ${ch.ideals}\nVínculos: ${ch.bonds}\nDefeitos: ${ch.flaws}\nNotas: ${ch.notes}`
    ].join('\n');

    // ---- Itens embutidos (raça/antecedente/classe/talentos/armas/magias/resto) ----
    const raceId = foundryId(), bgId = foundryId(), classId = foundryId();
    const species = SPECIES[ch.species] || {};
    const items = [];
    if (ch.species) {
        items.push({
            _id: raceId, name: ch.species, type: 'race', img: '',
            system: {
                description: { value: traitsText }, source: fSource,
                movement: { walk: mToFt(species.speed) },
                senses: { darkvision: mToFt(species.darkvision) },
                type: { value: 'humanoid' }, identifier: slugify(ch.species)
            }
        });
    }
    if (ch.background) {
        const bg = BACKGROUNDS[ch.background] || {};
        items.push({
            _id: bgId, name: ch.background, type: 'background', img: '',
            system: {
                description: { value: `Antecedente: ${ch.background}.${bg.feat ? ' Talento de origem: ' + bg.feat + '.' : ''}` },
                source: fSource, identifier: slugify(ch.background)
            }
        });
    }
    if (ch.className) {
        const casting = classData && classData.castingStat ? classData.castingStat : '';
        const progression = !casting ? 'none' : (ch.className === 'paladino' || ch.className === 'patrulheiro') ? 'half' : 'full';
        items.push({
            _id: classId, name: ch.className, type: 'class', img: '',
            system: {
                description: { value: featuresText }, source: fSource,
                identifier: slugify(ch.className), levels: ch.classLevel || ch.level,
                hd: { denomination: 'd' + ((classData && (classData.hd || classData.hpLevel1)) || 8), spent: 0 },
                spellcasting: { progression, ability: FOUNDRY_ATTR[casting] || '' }
            }
        });
    }
    if (classData2) {
        const casting2 = classData2.castingStat || '';
        const progression2 = !casting2 ? 'none' : (ch.class2 === 'paladino' || ch.class2 === 'patrulheiro') ? 'half' : 'full';
        items.push({
            _id: foundryId(), name: ch.class2, type: 'class', img: '',
            system: {
                description: { value: featuresText2 }, source: fSource,
                identifier: slugify(ch.class2), levels: ch.level2,
                hd: { denomination: 'd' + ((classData2.hd || classData2.hpLevel1) || 8), spent: 0 },
                spellcasting: { progression: progression2, ability: FOUNDRY_ATTR[casting2] || '' }
            }
        });
    }
    displayFeats(ch).forEach(f => items.push(buildFeatItem(f)));
    if (ch.featsHomebrew) items.push(buildFeatItem(ch.featsHomebrew, ch.featsHomebrew));
    const masterySet = [];
    (ch.inventory || []).forEach(e => {
        if (!e.catalog) return;
        if (WEAPONS[e.name]) {
            const w = WEAPONS[e.name];
            if (w.mastery && FOUNDRY_MASTERY[w.mastery] && !masterySet.includes(FOUNDRY_MASTERY[w.mastery])) {
                masterySet.push(FOUNDRY_MASTERY[w.mastery]);
            }
            items.push(buildWeaponItem(e.name, e.qty, e.equipped, e.detail));
        } else if (ARMORS[e.name] || e.name === 'Escudo') {
            items.push(buildArmorItem(e.name, e.qty, e.equipped, e.detail));
        } else {
            items.push(buildLootItem(e));
        }
    });
    const flatSpells = [];
    Object.keys(ch.spells || {}).forEach(k => (ch.spells[k] || []).forEach(n => flatSpells.push(n)));
    flatSpells.forEach(n => items.push(buildSpellItem(n)));

    const hpMax = parseInt(document.getElementById('summaryHP').textContent) || 10;
    const castingAbility = classData && classData.castingStat ? (FOUNDRY_ATTR[classData.castingStat] || '') : '';
    const slotInfo = getEffectiveSlots(chLevels.length ? chLevels : undefined);
    const spellSlots = {};
    for (let k = 1; k <= 9; k++) spellSlots[`spell${k}`] = { value: slotInfo.slots[k] || 0, override: null };
    spellSlots.pact = { value: slotInfo.pact ? slotInfo.pact.n : 0, override: null };

    const foundryData = {
        name: ch.name || 'Personagem', type: 'character',
        img: ch.fullBodyImg || ch.tokenImg || '',
        system: {
            abilities,
            skills,
            attributes: {
                hp: { value: hpMax, max: hpMax, temp: 0, tempmax: 0, bonuses: {} },
                ac: { flat: null },
                init: { ability: 'dex', roll: blankRoll() },
                movement: { units: 'ft' },
                spellcasting: castingAbility
            },
            currency: {
                pp: ch.money.PE || 0, gp: ch.money.PO || 0, ep: 0,
                sp: ch.money.PP || 0, cp: ch.money.PC || 0
            },
            details: {
                alignment: ch.alignment,
                biography: { value: biographyValue, public: '' },
                race: ch.species ? raceId : '',
                background: ch.background ? bgId : '',
                originalClass: ch.className ? classId : ''
            },
            traits: {
                size: FOUNDRY_SIZE[species.size] || 'med',
                languages: { value: (ch.languages || []).map(l => FOUNDRY_LANG[l] || slugify(l)) },
                weaponProf: { value: [], mastery: { value: masterySet } }
            },
            spells: spellSlots
        },
        prototypeToken: {
            name: ch.name || 'Personagem',
            texture: { src: ch.tokenImg || '' }
        },
        items,
        effects: [],
        ownership: { default: 0 },
        flags: {}
    };
    downloadJSON(foundryData, `${ch.name || 'personagem'}_foundry.json`);
}

// =============================================================================
// EXPORTAÇÃO PDF (preenche o modelo oficial editável V. 5.1.18 via pdf-lib)
// =============================================================================
const PDF_TEMPLATE_URL = '../D&D 5.5 - Ficha de Personagem - Editável - V. 5.1.18.pdf';
const FOUNDRY_SKILL = {
    'Acrobacia': 'acr', 'Lidar com Animais': 'ani', 'Arcanismo': 'arc', 'Atletismo': 'ath',
    'Enganação': 'dec', 'História': 'his', 'Intuição': 'ins', 'Intimidação': 'itm',
    'Investigação': 'inv', 'Medicina': 'med', 'Natureza': 'nat', 'Percepção': 'prc',
    'Atuação': 'prf', 'Persuasão': 'per', 'Religião': 'rel', 'Prestidigitação': 'slt',
    'Furtividade': 'ste', 'Sobrevivência': 'sur'
};
const PDF_SKILL_VALUE = {
    'Acrobacia': 'ACROBATICS', 'Lidar com Animais': 'ANIMAL HANDLING', 'Arcanismo': 'ARCANA',
    'Atletismo': 'ATHLETICS', 'Enganação': 'DECEPTION', 'História': 'HISTORY',
    'Intuição': 'INSIGHT', 'Intimidação': 'INTIMIDATE', 'Investigação': 'INVESTIGATION',
    'Medicina': 'MEDICINE', 'Natureza': 'NATURE', 'Percepção': 'PERCEPTION',
    'Atuação': 'PERFORMANCE', 'Persuasão': 'PERSUASION', 'Religião': 'RELIGION',
    'Prestidigitação': 'SLEIGHT OF HAND', 'Furtividade': 'STEALTH', 'Sobrevivência': 'SURVIVAL'
};
const PDF_SKILL_PIP = {
    'Acrobacia': 'Check Box8', 'Lidar com Animais': 'Check Box15', 'Arcanismo': 'Check Box24',
    'Atletismo': 'Check Box19', 'Enganação': 'Check Box4', 'História': 'Check Box20',
    'Intuição': 'Check Box13', 'Intimidação': 'Check Box3', 'Investigação': 'Check Box21',
    'Medicina': 'Check Box12', 'Natureza': 'Check Box22', 'Percepção': 'Check Box14',
    'Atuação': 'Check Box5', 'Persuasão': 'Check Box2', 'Religião': 'Check Box23',
    'Prestidigitação': 'Check Box9', 'Furtividade': 'Check Box10', 'Sobrevivência': 'Check Box16'
};
const PDF_SAVE_FIELDS = {
    for: { value: 'STR SAVE', pip: 'Check Box18' },
    des: { value: 'DEX SAVE', pip: 'Check Box11' },
    con: { value: 'CON SAVE', pip: 'Check Box7' },
    int: { value: 'INT SAVE', pip: 'Check Box25' },
    sab: { value: 'Text Field71', pip: 'Check Box17' },
    car: { value: 'CHA SAVE', pip: 'Check Box6' }
};

function setPdfText(form, name, value) {
    try {
        form.getTextField(name).setText(value == null ? '' : String(value));
    } catch (e) { /* campo ausente no modelo: ignora */ }
}

function setPdfCheck(form, name, on) {
    try {
        if (on) form.getCheckBox(name).check();
        else form.getCheckBox(name).uncheck();
    } catch (e) { /* ignora */ }
}

function fillPdfForm(form, ch) {
    const finalAttrs = ch.attributes || {};
    const level = ch.level || 1;
    const profBonus = getProficiencyBonus(level);
    const modOf = (a) => calcModifier(finalAttrs[a] != null ? finalAttrs[a] : 10);
    const saves = savingThrowsForClass(ch.className);
    const classData = CLASSES[ch.className];
    const species = SPECIES[ch.species] || {};
    const bg = BACKGROUNDS[ch.background] || {};

    // Identidade
    const pdfLevels = [];
    if (ch.className && CLASSES[ch.className]) {
        pdfLevels.push({ key: ch.className, data: CLASSES[ch.className], level: ch.classLevel || level });
    }
    if (ch.mcEnabled && ch.class2 && CLASSES[ch.class2]) {
        pdfLevels.push({ key: ch.class2, data: CLASSES[ch.class2], level: ch.level2 });
    }
    const pdfClassLine = pdfLevels.length
        ? pdfLevels.map(e => `${(e.data && e.data.name) || e.key} ${e.level}`).join(' / ')
        : (ch.className || '');
    const pdfSub1 = ch.className && (ch.subclass || {})[ch.className];
    const pdfSub2 = (ch.mcEnabled && ch.class2 && (ch.subclass || {})[ch.class2]) || '';
    setPdfText(form, 'Name', ch.name);
    setPdfText(form, 'Class', pdfClassLine);
    setPdfText(form, 'Subclass', [pdfSub1, pdfSub2].filter(Boolean).join(' / '));
    setPdfText(form, 'Background', ch.background);
    setPdfText(form, 'Species', ch.species + (ch.subrace ? ' (' + ch.subrace + ')' : ''));
    setPdfText(form, 'Alignment', ch.alignment);
    setPdfText(form, 'Level', level);

    // Atributos
    const PDF_ATTR = { for: 'STR', des: 'DEX', con: 'CON', int: 'INT', sab: 'WIS', car: 'CHA' };
    ATTRIBUTES.forEach(a => {
        setPdfText(form, `${PDF_ATTR[a]} SCORE`, finalAttrs[a] != null ? finalAttrs[a] : 10);
        setPdfText(form, `${PDF_ATTR[a]} MOD`, formatModifier(modOf(a)));
    });
    setPdfText(form, 'PROF BONUS', formatModifier(profBonus));
    setPdfText(form, 'init', formatModifier(modOf('des')));
    setPdfText(form, 'SPEED', species.speed != null ? species.speed : 9);
    setPdfText(form, 'SIZE', species.size || 'Médio');
    const hasPerc = (ch.skillsProf || []).includes('Percepção');
    setPdfText(form, 'PASSIVE PERCEPTION', calculatePassivePerception(modOf('sab'), profBonus, hasPerc));

    // PV / CA / DV
    const hpMax = parseInt(document.getElementById('summaryHP').textContent) ||
        ((classData ? classData.hpLevel1 : 10) + modOf('con'));
    setPdfText(form, 'Armor Class', document.getElementById('summaryCA').textContent);
    setPdfText(form, 'Current HP', hpMax);
    setPdfText(form, 'Max HP', hpMax);
    setPdfText(form, 'Max HD', pdfLevels.length
        ? pdfLevels.map(e => `${e.level}d${(e.data.hd || e.data.hpLevel1) || 8}`).join(' / ')
        : `${level}d${(classData && (classData.hd || classData.hpLevel1)) || 8}`);

    // Salvaguardas + perícias (valor total + pip de proficiência)
    ATTRIBUTES.forEach(a => {
        const has = saves.includes(a);
        setPdfText(form, PDF_SAVE_FIELDS[a].value, formatModifier(modOf(a) + (has ? profBonus : 0)));
        setPdfCheck(form, PDF_SAVE_FIELDS[a].pip, has);
    });
    Object.keys(PDF_SKILL_VALUE).forEach(pt => {
        const attr = SKILLS[pt] ? SKILLS[pt].attr : 'for';
        const has = (ch.skillsProf || []).includes(pt);
        setPdfText(form, PDF_SKILL_VALUE[pt], formatModifier(modOf(attr) + (has ? profBonus : 0)));
        setPdfCheck(form, PDF_SKILL_PIP[pt], has);
    });
    setPdfCheck(form, 'shield chk', !!ch.hasShield);

    // Ataques: armas equipadas + cards de magia ativos (máx. 6 linhas)
    const atkRows = [];
    (ch.inventory || []).forEach(e => {
        if (e.catalog && WEAPONS[e.name]) {
            const w = WEAPONS[e.name];
            const ab = weaponAttackAbility(e.name);
            const mod = calcModifier(finalAttrs[ab] != null ? finalAttrs[ab] : 10);
            atkRows.push({
                name: e.name,
                bonus: formatModifier(profBonus + mod),
                dmg: `${w.damage}${formatModifier(mod)} ${w.type || ''}`.trim(),
                notes: [w.mastery, weaponRangeText(e.name), (w.properties || []).join(', ')].filter(Boolean).join(' · ')
            });
        }
    });
    Object.keys(state.spellAttackCards || {}).forEach(n => {
        const c = state.spellAttackCards[n];
        if (!c || !c.enabled) return;
        atkRows.push({
            name: c.nome || n,
            bonus: c.ataque || '',
            dmg: `${c.dano || ''}`.trim(),
            notes: [c.tipo, c.alcance].filter(Boolean).join(' · ')
        });
    });
    for (let i = 0; i < 6; i++) {
        const r = atkRows[i];
        setPdfText(form, `NAME - WEAPON ${i + 1}`, r ? r.name : '');
        setPdfText(form, `BONUS/DC - WEAPON ${i + 1}`, r ? r.bonus : '');
        setPdfText(form, `DAMAGE/TYPE - WEAPON ${i + 1}`, r ? r.dmg : '');
        setPdfText(form, `NOTES - WEAPON ${i + 1}`, r ? r.notes : '');
    }

    // Características / equipamento / idiomas
    const featLine = (f) => `${f.name}: ${f.desc}`;
    const feats = getFeaturesUpToLevel(classData, pdfLevels.length ? pdfLevels[0].level : level) || [];
    const half = Math.ceil(feats.length / 2);
    setPdfText(form, 'CLASS FEATURES 1', feats.slice(0, half).map(featLine).join('\n'));
    setPdfText(form, 'CLASS FEATURES 2', feats.slice(half).map(featLine).join('\n'));
    setPdfText(form, 'SPECIES TRAITS', speciesTraitsFor(ch.species, ch.subrace).map(featLine).join('\n'));
    setPdfText(form, 'FEATS', displayFeats(ch).concat(ch.featsHomebrew ? [ch.featsHomebrew] : []).join('\n'));
    setPdfText(form, 'EQUIPMENT', (ch.inventory || [])
        .map(e => `${e.name}${e.qty > 1 ? ' (×' + e.qty + ')' : ''}${e.equipped ? ' [equipado]' : ''}`).join('\n'));
    setPdfText(form, 'LANGUAGES', (ch.languages || []).join(', '));
    setPdfText(form, 'TOOL PROF', bg.tool || '');

    // Moedas
    setPdfText(form, 'CP', ch.money.PC || 0);
    setPdfText(form, 'SP', ch.money.PP || 0);
    setPdfText(form, 'EP', 0);
    setPdfText(form, 'GP', ch.money.PO || 0);
    setPdfText(form, 'PP', ch.money.PE || 0);

    // Magias (29 linhas: truques + círculos)
    const pdfSlotInfo = getEffectiveSlots(pdfLevels.length ? pdfLevels : undefined);
    for (let k = 1; k <= 9; k++) {
        setPdfText(form, `LVL${k} TOTAL`, pdfSlotInfo.slots[k] || '');
    }
    const pdfCaster = pdfLevels.find(e => e.data.castingStat) || null;
    if (pdfCaster) {
        const castMod = modOf(pdfCaster.data.castingStat);
        setPdfText(form, 'SPELLCASTING ABILITY', ATTR_NAMES[pdfCaster.data.castingStat] || '');
        setPdfText(form, 'SPELLCASTING MOD', formatModifier(castMod));
        setPdfText(form, 'SPELL SAVE DC', 8 + castMod + profBonus);
        setPdfText(form, 'SPELL ATTACK BONUS', formatModifier(castMod + profBonus));
    }
    const spellRows = [];
    (ch.spells.cantrips || []).forEach(n => spellRows.push({ name: n, levelLabel: '0' }));
    for (let k = 1; k <= 9; k++) {
        ((ch.spells[`lvl${k}`]) || []).forEach(n => spellRows.push({ name: n, levelLabel: String(k) }));
    }
    spellRows.slice(0, 29).forEach((s, i) => {
        const data = SPELLS.find(x => x.name === s.name) || {};
        setPdfText(form, `SPELL NAME${i}`, s.name);
        setPdfText(form, `SPELL LEVEL${i}`, s.levelLabel);
        setPdfText(form, `CASTING TIME${i}`, data.castingTime || '');
        setPdfText(form, `RANGE${i}`, data.range || '');
        const flags = [data.ritual && 'Ritual', data.concentration && 'Concentração'].filter(Boolean).join(' · ');
        setPdfText(form, `SPELL NOTES${i}`, flags);
    });

    // Personalidade
    const pers = [
        ch.personality && `Traços: ${ch.personality}`,
        ch.ideals && `Ideais: ${ch.ideals}`,
        ch.bonds && `Vínculos: ${ch.bonds}`,
        ch.flaws && `Defeitos: ${ch.flaws}`,
        ch.notes && `Notas: ${ch.notes}`
    ].filter(Boolean).join('\n');
    setPdfText(form, 'BACKSTORY / PERSONALITY', pers);
}

function pickPdfTemplate() {
    return new Promise(resolve => {
        const inp = document.getElementById('pdfTemplateInput');
        if (!inp) { resolve(null); return; }
        inp.value = '';
        inp.onchange = () => {
            const f = inp.files[0];
            if (!f) { resolve(null); return; }
            const r = new FileReader();
            r.onload = ev => resolve(new Uint8Array(ev.target.result));
            r.onerror = () => resolve(null);
            r.readAsArrayBuffer(f);
        };
        inp.click();
    });
}

async function loadTemplateBytes() {
    try {
        const res = await fetch(PDF_TEMPLATE_URL);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return new Uint8Array(await res.arrayBuffer());
    } catch (e) { /* file:// ou sem servidor: usa o modelo embutido */ }
    try {
        const b64 = await ensureTemplateB64();
        if (b64) return b64ToBytes(b64);
    } catch (e) { /* ignora */ }
    const picked = await pickPdfTemplate();
    if (!picked) throw new Error('modelo não selecionado');
    return picked;
}

let pdfTemplateB64Promise = null;
function ensureTemplateB64() {
    if (window.PDF_TEMPLATE_B64) return Promise.resolve(window.PDF_TEMPLATE_B64);
    if (!pdfTemplateB64Promise) {
        pdfTemplateB64Promise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'pdf-template.js';
            s.onload = () => resolve(window.PDF_TEMPLATE_B64 || null);
            s.onerror = () => reject(new Error('modelo embutido ausente'));
            document.head.appendChild(s);
        });
    }
    return pdfTemplateB64Promise;
}

function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function buildFilledPdfBytes() {
    if (typeof PDFLib === 'undefined') throw new Error('biblioteca PDFLib não carregada');
    updateCharacterData();
    const bytes = await loadTemplateBytes();
    const pdf = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = pdf.getForm();
    fillPdfForm(form, character);
    try { form.updateFieldAppearances(); } catch (e) { /* mantém aparências originais */ }
    return await pdf.save();
}

function downloadPdfBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function savePdfBytes(bytes, filename) {
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
            });
            const w = await handle.createWritable();
            await w.write(bytes);
            await w.close();
            return;
        } catch (e) {
            if (e && e.name === 'AbortError') return;
        }
    }
    downloadPdfBytes(bytes, filename);
}

async function exportPDF() {
    try {
        const bytes = await buildFilledPdfBytes();
        await savePdfBytes(bytes, `${character.name || 'personagem'}_ficha.pdf`);
    } catch (err) {
        alert('Não foi possível gerar o PDF: ' + err.message);
    }
}

async function previewPrint() {
    try {
        const bytes = await buildFilledPdfBytes();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
        alert('Não foi possível pré-visualizar: ' + err.message);
    }
}

function spellLines(ch) {
    const lines = [];
    lines.push(`Truques: ${(ch.spells.cantrips || []).join(', ') || '-'}`);
    for (let k = 1; k <= 9; k++) {
        const names = ch.spells[`lvl${k}`] || [];
        if (names.length) lines.push(`${k}º Círculo: ${names.join(', ')}`);
    }
    return lines;
}

function generatePrintContent() {
    const ch = character;
    const finalAttrs = ch.attributes;
    const profBonus = getProficiencyBonus(ch.level);
    const classData = CLASSES[ch.className];
    const species = SPECIES[ch.species];

    const skillsHTML = ch.skillsProf.map(skill => {
        const attr = SKILLS[skill] ? SKILLS[skill].attr : 'for';
        const mod = calcModifier(finalAttrs[attr]) + profBonus;
        return `<li>${skill} (${formatModifier(mod)})</li>`;
    }).join('');

    const featuresHTML = getFeaturesUpToLevel(classData, ch.classLevel || ch.level)
        ? getFeaturesUpToLevel(classData, ch.classLevel || ch.level).map(f => `<li><strong>${f.name}:</strong> ${f.desc}</li>`).join('') : '';
    const subPrint1 = ch.className ? subclassSectionsText(ch.className, ch.classLevel || ch.level) : '';
    const subPrint2 = (ch.mcEnabled && ch.class2) ? subclassSectionsText(ch.class2, ch.level2) : '';
    const subNameP1 = ch.className && (ch.subclass || {})[ch.className];
    const subNameP2 = (ch.mcEnabled && ch.class2 && (ch.subclass || {})[ch.class2]) || '';
    const classLineP = [ch.className && `${(CLASSES[ch.className] || {}).name || ch.className} ${ch.classLevel || ch.level}`,
        ch.mcEnabled && ch.class2 && `${(CLASSES[ch.class2] || {}).name || ch.class2} ${ch.level2}`].filter(Boolean).join(' / ') || ch.className;
    const traitsHTML = (species)
        ? speciesTraitsFor(ch.species, ch.subrace).map(t => `<li><strong>${t.name}:</strong> ${t.desc}</li>`).join('') : '';
    const equipHTML = (ch.inventory && ch.inventory.length
        ? ch.inventory.map(e => `<li>${e.name}${e.qty > 1 ? ' (×' + e.qty + ')' : ''}${e.equipped ? ' <em>[equipado]</em>' : ''}</li>`).join('')
        : ch.equipment.map(i => `<li>${i}</li>`).join(''));
    const spellsHTML = (ch.spells.cantrips && ch.spells.cantrips.length) || [1,2,3,4,5,6,7,8,9].some(k => (ch.spells[`lvl${k}`] || []).length)
        ? `
        <h2>Magias</h2>
        ${spellLines(ch).map(l => `<p>${l}</p>`).join('')}` : '';
    const featsHTML = (displayFeats(ch).length) || ch.featsHomebrew
        ? `<h2>Talentos</h2><ul>${displayFeats(ch).concat(ch.featsHomebrew ? [ch.featsHomebrew] : []).map(f => `<li>${f}</li>`).join('')}</ul>` : '';

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Ficha - ${ch.name}</title>
        <style>
            body { font-family: Arial; margin: 20px; }
            h1 { color: #8B0000; border-bottom: 2px solid #8B0000; }
            h2 { color: #333; margin-top: 20px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
            .stat { text-align: center; padding: 10px; border: 1px solid #ccc; }
            .stat-value { font-size: 24px; font-weight: bold; }
            ul { list-style: none; columns: 2; }
            li { padding: 2px 0; }
            .personality { margin-top: 20px; padding: 10px; background: #f5f5f5; }
        </style>
    </head>
    <body>
        <h1>Ficha de Personagem - D&D 5.5</h1>
        <p><strong>Nome:</strong> ${ch.name} | <strong>Nível:</strong> ${ch.level} | <strong>Classe:</strong> ${classLineP}${subNameP1 ? ` (${subNameP1})` : ''}${subNameP2 ? ` / ${subNameP2}` : ''}</p>
        <p><strong>Espécie:</strong> ${ch.species}${ch.subrace ? ' (' + ch.subrace + ')' : ''} | <strong>Antecedente:</strong> ${ch.background} | <strong>Alinhamento:</strong> ${ch.alignment}</p>

        <h2>Atributos</h2>
        <div class="grid">
            ${ATTRIBUTES.map(attr => `
                <div class="stat">
                    <div>${ATTR_NAMES[attr]}</div>
                    <div class="stat-value">${finalAttrs[attr]}</div>
                    <div>${formatModifier(calcModifier(finalAttrs[attr]))}</div>
                </div>
            `).join('')}
        </div>

        <h2>Estatísticas</h2>
        <div class="grid">
            <div class="stat"><div>CA</div><div class="stat-value">${document.getElementById('summaryCA').textContent}</div></div>
            <div class="stat"><div>PV</div><div class="stat-value">${document.getElementById('summaryHP').textContent}</div></div>
            <div class="stat"><div>Iniciativa</div><div class="stat-value">${document.getElementById('summaryInit').textContent}</div></div>
            <div class="stat"><div>Deslocamento</div><div class="stat-value">${document.getElementById('summarySpeed').textContent}</div></div>
            <div class="stat"><div>Proficiência</div><div class="stat-value">${document.getElementById('summaryProf').textContent}</div></div>
            <div class="stat"><div>Percepção Passiva</div><div class="stat-value">${document.getElementById('summaryPassive').textContent}</div></div>
        </div>

        <h2>Perícias de Proficiência</h2>
        <ul>${skillsHTML}</ul>

        <h2>Equipamento</h2>
        <ul>${equipHTML}</ul>

        ${spellsHTML}

        ${featsHTML}

        <h2>Habilidades de Classe</h2>
        <ul>${featuresHTML}</ul>
        ${subPrint1 ? `<h2>Subclasse${subNameP1 ? ' — ' + subNameP1 : ''}</h2><ul>${subPrint1.split('\n').map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
        ${subPrint2 ? `<h2>Subclasse (2ª)${subNameP2 ? ' — ' + subNameP2 : ''}</h2><ul>${subPrint2.split('\n').map(l => `<li>${l}</li>`).join('')}</ul>` : ''}

        <h2>Traços de Espécie</h2>
        <ul>${traitsHTML}</ul>

        <div class="personality">
            <h2>Personalidade</h2>
            <p><strong>Traços:</strong> ${ch.personality || 'Não definido'}</p>
            <p><strong>Ideais:</strong> ${ch.ideals || 'Não definido'}</p>
            <p><strong>Vínculos:</strong> ${ch.bonds || 'Não definido'}</p>
            <p><strong>Defeitos:</strong> ${ch.flaws || 'Não definido'}</p>
            <p><strong>Notas:</strong> ${ch.notes || 'Nenhuma'}</p>
        </div>
    </body>
    </html>
    `;
}

// =============================================================================
// SALVAR / CARREGAR
// =============================================================================
function saveCharacter() {
    updateCharacterData();
    downloadJSON(character, `${character.name || 'personagem'}.json`);
}

function loadCharacter(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            character = Object.assign({}, character, data);

            document.getElementById('charName').value = data.name || '';
            document.getElementById('charClass').value = data.className || '';
            document.getElementById('charSpecies').value = data.species || '';
            document.getElementById('charBackground').value = data.background || '';
            document.getElementById('charAlignment').value = data.alignment || 'Neutro';

            // Multiclasse / subclasse / ASI
            state.mc = {
                enabled: !!(data.mcEnabled && data.class2 && CLASSES[data.class2]),
                class2: (data.class2 && CLASSES[data.class2]) ? data.class2 : '',
                level2: Math.max(1, data.level2 || 1)
            };
            document.getElementById('multiclassToggle').checked = state.mc.enabled;
            document.getElementById('charClass2').value = state.mc.class2;
            document.getElementById('charLevel2').value = state.mc.level2;
            document.getElementById('charLevel').value = data.classLevel || data.level || 1;
            state.subclass = Object.assign({}, data.subclass);
            state.asi = Array.isArray(data.asi) ? data.asi.filter(e => e && e.cls && e.level) : [];

            // Restaurar método de atributos
            const method = data.attributeMethod || 'standard';
            document.getElementById('attrMethod').value = method;
            renderAttributes();
            if (method === 'standard' || method === 'roll') {
                // reatribuir valores puros
                ATTRIBUTES.forEach(a => {
                    const v = data.baseAttributes ? data.baseAttributes[a] : data.attributes[a];
                    if (v != null) state.attrValues[a] = v;
                });
                ATTRIBUTES.forEach(a => refreshAttrSelectOptions(a));
            } else {
                ATTRIBUTES.forEach(a => {
                    const v = data.baseAttributes ? data.baseAttributes[a] : data.attributes[a];
                    if (v != null && document.querySelector(`#attributesGrid input[data-attr="${a}"]`)) {
                        document.querySelector(`#attributesGrid input[data-attr="${a}"]`).value = v;
                    }
                });
            }
            state.bonusAttrs = Array.isArray(data.bonusAttrs) ? data.bonusAttrs.filter(a => ATTRIBUTES.includes(a)).slice() : [];
            updateBonusButtons();

            // Restaurar perícias
            document.querySelectorAll('#skillsGrid input[type="checkbox"]').forEach(cb => {
                cb.checked = (data.skillsProf || []).includes(cb.dataset.skill);
            });
            state.freeSkills = !!data.freeSkills;
            document.getElementById('freeSkillsToggle').checked = state.freeSkills;

            // Equipamento
            state.extraEquipment = (data.extraEquipment || []).slice();
            state.classEquipSel = (data.classEquipSel || []).slice();
            state.bgEquipSel = (data.bgEquipSel || []).slice();
            state.equipped = [];
            if (Array.isArray(data.inventory)) {
                data.inventory.forEach(e => { if (e.equipped && e.catalog && knownBase(e.name)) state.equipped.push(e.name); });
            } else if (Array.isArray(data.equipped)) {
                state.equipped = data.equipped.slice();
            } else {
                if (data.armor && data.armor !== 'Nenhuma') state.equipped.push(data.armor);
                if (data.hasShield) state.equipped.push('Escudo');
                if (data.weapon && knownBase(data.weapon)) state.equipped.push(data.weapon);
            }
            state.equipped = [...new Set(state.equipped)];
            if (data.spells) {
                state.spells = {
                    cantrips: data.spells.cantrips || [],
                    lvl1: (data.spells.lvl1 || (data.spells.level1 || [])).slice(),
                    lvl2: data.spells.lvl2 || [], lvl3: data.spells.lvl3 || [], lvl4: data.spells.lvl4 || [],
                    lvl5: data.spells.lvl5 || [], lvl6: data.spells.lvl6 || [], lvl7: data.spells.lvl7 || [],
                    lvl8: data.spells.lvl8 || [], lvl9: data.spells.lvl9 || []
                };
            }
            state.feats = Array.isArray(data.feats) ? data.feats.slice() : [];
            state.originSwap = !!data.originSwap;
            state.originFeat = data.originFeat || '';
            state.prevBackground = data.background || '';
            state.extraAllowed = data.extraAllowed === undefined ? !!(data.feats && data.feats.length) : !!data.extraAllowed;
            if (data.featsHomebrew != null) document.getElementById('featsHomebrew').value = data.featsHomebrew;
            state.languagesChosen = Array.isArray(data.languagesChosen) ? data.languagesChosen.slice() : (Array.isArray(data.languages) ? data.languages.filter(l => l !== 'Comum') : []);
            populateLanguages();
            renderFeats();
            renderEquipmentChoices();
            renderExtraEquipmentList();
            updateBackgroundInfo();

            // Textos
            document.getElementById('personality').value = data.personality || '';
            document.getElementById('ideals').value = data.ideals || '';
            document.getElementById('bonds').value = data.bonds || '';
            document.getElementById('flaws').value = data.flaws || '';
            document.getElementById('notes').value = data.notes || '';

            state.tokenImg = data.tokenImg || '';
            state.fullBodyImg = data.fullBodyImg || '';
            state.attackObs = data.attackObs || {};
            state.spellAttackCards = data.spellAttackCards || {};
            setUploadPreview('tokenUpload', 'tokenPlaceholder', 'tokenPreview', state.tokenImg);
            setUploadPreview('fullBodyUpload', 'fullBodyPlaceholder', 'fullBodyPreview', state.fullBodyImg);
            syncBasicsFromSelects();
            const subSel = document.getElementById('charSubrace');
            if (data.subrace && subSel && Array.from(subSel.options).some(o => o.value === data.subrace)) {
                subSel.value = data.subrace;
                renderSpeciesTraits();
            }
            updateSkillsAvailability();
            updateAllCalculations();
            resetHistory();
            alert('Personagem carregado com sucesso!');
        } catch (err) {
            alert('Erro ao carregar arquivo: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}