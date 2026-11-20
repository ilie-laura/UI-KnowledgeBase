const KB = {
    fapte: {},
    reguli: [],
    carduriDeduse: [] // Toate concluziile transformate în propoziții naturale
};

// Starea filtrelor active
const state = {
    searchText: "",
    regulaSelectata: null,
    userSelectat: null,
    categorieSelectata: null,
    cardSelectat: null
};

// Dicționar pentru a transforma numele tehnice din Prolog/XML în etichete 
const DICTIONAR_NATURAL = {
    user_tanar: { label: "Client Tânăr", titlu: (u) => `${cap(u)} este un client tânăr`, desc: (u, d) => `Are vârsta sub 30 de ani (${d.varsta} ani), încadrându-se în segmentul tânăr.` },
    user_loial: { label: "Client Loial", titlu: (u) => `${cap(u)} are statut de client loial`, desc: (u, d) => `Deține abonament ${d.abonament.toUpperCase()}, beneficiind de reduceri de loialitate.` },
    client_mare: { label: "Putere Cumpărare", titlu: (u) => `${cap(u)} are putere mare de cumpărare`, desc: (u, d) => `A cheltuit în total ${d.total} lei, depășind pragul VIP de 1500 lei.` },
    engagement_ridicat: { label: "Engagement Ridicat", titlu: (u) => `${cap(u)} petrece mult timp pe site`, desc: (u, d) => `Media sesiunii este de ${d.minute} minute (peste pragul de 20 min).` },
    risc_abandon_ridicat: { label: "Risc Abandon", titlu: (u) => `${cap(u)} prezintă risc ridicat de abandon`, desc: (u, d) => `Are în coșul abandonat produsul ${formatProd(d.produs)} în valoare de ${d.valoare} lei.` },
    candidat_upgrade_vip: { label: "Upgrade VIP", titlu: (u) => `${cap(u)} este candidat pentru upgrade VIP`, desc: (u, d) => `Are cont standard, interes ridicat și ${d.comenzi} comenzi în ultimele 6 luni.` },
    client_inactiv: { label: "Client Inactiv", titlu: (u) => `${cap(u)} este un client inactiv`, desc: (u, d) => `Au trecut ${d.zile} zile de la ultima comandă (peste limita de 60 zile).` },
    
    produs_scump: { label: "Produs Premium", titlu: (_, p) => `${formatProd(p)} este un produs scump`, desc: (_, d) => `Prețul este de ${d.pret} lei (peste 1000 lei) și beneficiază de livrare gratuită.` },
    produs_accesibil: { label: "Produs Accesibil", titlu: (_, p) => `${formatProd(p)} are un preț accesibil`, desc: (_, d) => `Costă ${d.pret} lei (sub pragul de 400 lei) în categoria ${d.categorie}.` },
    in_stoc: { label: "În Stoc", titlu: (_, p) => `${formatProd(p)} este disponibil în stoc`, desc: (_, d) => `Există ${d.stoc} bucăți disponibile imediat în categoria ${d.categorie}.` },

    interes_ridicat: { label: "Interes Ridicat", titlu: (u, _, c) => `${cap(u)} are interes ridicat pentru ${c}`, desc: (_, d) => `A înregistrat ${d.nr_vizualizari} vizualizări în categoria ${d.categorie}.` },
    cumparator_impulsiv: { label: "Cumpărător Impulsiv", titlu: (u, _, c) => `${cap(u)} este cumpărător impulsiv (${c})`, desc: (_, d) => `Client tânăr, cu timp mare petrecut pe site și ${d.nr_vizualizari} vizualizări în ${d.categorie}.` },

    recomanda_produs: { label: "Recomandare", titlu: (u, p) => `Recomandă ${formatProd(p)} pentru ${cap(u)}`, desc: (u, d) => `${cap(u)} are interes ridicat în ${d.categorie}, produsul este în stoc (${d.pret} lei) și nu l-a cumpărat încă.` },
    eligibil_voucher: { label: "Voucher Coș", titlu: (u, p) => `Oferă voucher lui ${cap(u)} pentru ${formatProd(p)}`, desc: (u, d) => `${cap(u)} (abonament standard) a abandonat produsul în coș, iar acesta este în stoc.` },
    oferta_exclusiva: { label: "Ofertă Exclusivă", titlu: (u, p) => `Ofertă exclusivă: ${formatProd(p)} pentru ${cap(u)}`, desc: (u, d) => `Campanie dedicată clienților loiali (${d.abonament}) interesați de produse scumpe din ${d.categorie}.` },
    eligibil_easybox: { label: "Livrare Easybox", titlu: (u, p) => `${cap(u)} poate comanda ${formatProd(p)} la Easybox`, desc: (u, d) => `Utilizatorul este din mediul urban, produsul este în stoc și costă ${d.pret} lei (< 1000 lei).` }
};

function cap(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

function formatProd(str) {
    return str ? str.replace(/_/g, " ") : "";
}

// Elimină diacriticele 
function normalizeText(str) {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

//parser
async function init() {
    try {
        const res = await fetch("date.xml");
        if (!res.ok) throw new Error("Nu s-a putut citi date.xml");
        const xmlText = await res.text();
        const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");

        // Parsare Fapte
        let totalFapte = 0;
        xmlDoc.querySelectorAll("fapte > *").forEach(nod => {
            const tag = nod.tagName;
            if (!KB.fapte[tag]) KB.fapte[tag] = [];
            const obj = {};
            for (let attr of nod.attributes) {
                obj[attr.name] = isNaN(attr.value) ? attr.value : Number(attr.value);
            }
            KB.fapte[tag].push(obj);
            totalFapte++;
        });

        // Parsare Reguli
        xmlDoc.querySelectorAll("reguli > regula").forEach(nod => {
            const id = nod.getAttribute("id");
            const conditii = Array.from(nod.querySelectorAll("if > conditie")).map(c => ({
                tip: c.getAttribute("tip"),
                nume: c.getAttribute("nume"),
                camp: c.getAttribute("camp"),
                op: c.getAttribute("op"),
                valoare: isNaN(c.getAttribute("valoare")) ? c.getAttribute("valoare") : Number(c.getAttribute("valoare"))
            }));
            const concluzie = nod.querySelector("then").getAttribute("concluzie");
            KB.reguli.push({ id, conditii, concluzie });
        });

        ruleazaInferenta();
        genereazaCarduriNaturale();
        populeazaFiltre();
        populeazaInspector(totalFapte);
        renderRezultate();

    } catch (e) {
        document.getElementById("results-grid").innerHTML = 
            `<p style="color:#dc2626;">Eroare: ${e.message}. Pornește pagina cu <strong>Live Server</strong> din VS Code.</p>`;
    }
}


const concluziiRaw = {};

function verificaOp(val, op, target) {
    if (op === "<") return val < target;
    if (op === ">") return val > target;
    if (op === "<=") return val <= target;
    if (op === ">=") return val >= target;
    if (op === "==") return val == target;
    return false;
}

function ruleazaInferenta() {
    KB.reguli.forEach(r => { if (!concluziiRaw[r.concluzie]) concluziiRaw[r.concluzie] = []; });
    const users = KB.fapte.user || [];
    const produse = KB.fapte.produs || [];

    for (let pas = 0; pas < 3; pas++) {
        KB.reguli.forEach(regula => {
            const c = regula.concluzie;

            if (["user_tanar", "user_loial", "client_mare", "engagement_ridicat", "risc_abandon_ridicat", "candidat_upgrade_vip", "client_inactiv"].includes(c)) {
                users.forEach(u => {
                    if (evalueaza(regula, u.nume, null, null) && !concluziiRaw[c].some(x => x.user === u.nume)) {
                        concluziiRaw[c].push({ user: u.nume });
                    }
                });
            } else if (["produs_scump", "produs_accesibil", "in_stoc"].includes(c)) {
                produse.forEach(p => {
                    if (evalueaza(regula, null, p.nume, null) && !concluziiRaw[c].some(x => x.produs === p.nume)) {
                        concluziiRaw[c].push({ produs: p.nume, categorie: p.categorie });
                    }
                });
            } else if (["interes_ridicat", "cumparator_impulsiv"].includes(c)) {
                (KB.fapte.vizualizari || []).forEach(v => {
                    if (evalueaza(regula, v.utilizator, null, v.categorie) && !concluziiRaw[c].some(x => x.user === v.utilizator && x.categorie === v.categorie)) {
                        concluziiRaw[c].push({ user: v.utilizator, categorie: v.categorie });
                    }
                });
            } else if (["recomanda_produs", "eligibil_voucher", "oferta_exclusiva", "eligibil_easybox"].includes(c)) {
                users.forEach(u => {
                    produse.forEach(p => {
                        if (evalueaza(regula, u.nume, p.nume, p.categorie) && !concluziiRaw[c].some(x => x.user === u.nume && x.produs === p.nume)) {
                            concluziiRaw[c].push({ user: u.nume, produs: p.nume, categorie: p.categorie });
                        }
                    });
                });
            }
        });
    }
}

function evalueaza(regula, userName, prodName, catName) {
    return regula.conditii.every(cond => {
        if (cond.tip === "regula") {
            return (concluziiRaw[cond.nume] || []).some(item => {
                if (item.user && userName && item.user !== userName) return false;
                if (item.produs && prodName && item.produs !== prodName) return false;
                if (item.categorie && catName && item.categorie !== catName) return false;
                return true;
            });
        }
        if (cond.tip === "fapt") {
            const lista = KB.fapte[cond.nume] || [];
            if (cond.op === "exists") return lista.some(f => (!userName || f.utilizator === userName) && (!prodName || f.produs === prodName));
            if (cond.op === "not_exists") return !lista.some(f => (!userName || f.utilizator === userName) && (!prodName || f.produs === prodName));

            return lista.some(f => {
                if (f.nume && userName && cond.nume === "user" && f.nume !== userName) return false;
                if (f.nume && prodName && cond.nume === "produs" && f.nume !== prodName) return false;
                if (f.utilizator && userName && f.utilizator !== userName) return false;
                if (f.produs && prodName && f.produs !== prodName) return false;
                if (f.categorie && catName && f.categorie !== catName) return false;
                return verificaOp(f[cond.camp], cond.op, cond.valoare);
            });
        }
        return false;
    });
}


function genereazaCarduriNaturale() {
    Object.entries(concluziiRaw).forEach(([regula, items]) => {
        const meta = DICTIONAR_NATURAL[regula];
        if (!meta) return;

        items.forEach(item => {
            // Adunăm toate datele relevante despre user/produs pentru descriere
            const uObj = (KB.fapte.user || []).find(u => u.nume === item.user) || {};
            const pObj = (KB.fapte.produs || []).find(p => p.nume === item.produs) || {};
            const mObj = (KB.fapte.monetary || []).find(m => m.utilizator === item.user) || {};
            const tObj = (KB.fapte.timp_pe_site || []).find(t => t.utilizator === item.user) || {};
            const rObj = (KB.fapte.recency || []).find(r => r.utilizator === item.user) || {};
            const fObj = (KB.fapte.frequency || []).find(f => f.utilizator === item.user) || {};
            const vObj = (KB.fapte.vizualizari || []).find(v => v.utilizator === item.user && v.categorie === item.categorie) || {};
            const cObj = (KB.fapte.cos_abandonat || []).find(c => c.utilizator === item.user) || {};

            const dateCombinate = { ...uObj, ...pObj, ...mObj, ...tObj, ...rObj, ...fObj, ...vObj, ...cObj };
            const categorieFinala = item.categorie || pObj.categorie || null;

            const titlu = meta.titlu(item.user, item.produs, categorieFinala);
            const descriere = meta.desc(item.user, dateCombinate);
            const regulaSursa = KB.reguli.find(r =>
                r.concluzie === regula && evalueaza(r, item.user, item.produs, categorieFinala)
            );

            const tags = [
                `#${regula}`,
                item.user ? `#${item.user}` : null,
                item.produs ? `#${item.produs}` : null,
                categorieFinala ? `#${categorieFinala}` : null,
                uObj.abonament ? `#${uObj.abonament}` : null,
                uObj.mediu ? `#${uObj.mediu}` : null
            ].filter(Boolean);

            KB.carduriDeduse.push({
                regula,
                regulaLabel: meta.label,
                user: item.user || null,
                produs: item.produs || null,
                categorie: categorieFinala,
                regulaId: regulaSursa ? regulaSursa.id : "",
                regulaSursa,
                titlu,
                descriere,
                tags,
                searchIndex: normalizeText(`${titlu} ${descriere} ${tags.join(" ")} ${meta.label}`)
            });
        });
    });
}

function populeazaFiltre() {
    //  Reguli
    const divReguli = document.getElementById("pills-reguli");
    Object.keys(concluziiRaw).forEach(reg => {
        if (!DICTIONAR_NATURAL[reg] || concluziiRaw[reg].length === 0) return;
        const btn = creeazaPill(DICTIONAR_NATURAL[reg].label, () => {
            state.regulaSelectata = state.regulaSelectata === reg ? null : reg;
            actualizeazaStarePills();
            renderRezultate();
        });
        btn.dataset.val = reg;
        divReguli.appendChild(btn);
    });

    //  Utilizatori
    const divUseri = document.getElementById("pills-useri");
    (KB.fapte.user || []).forEach(u => {
        const btn = creeazaPill(cap(u.nume), () => {
            state.userSelectat = state.userSelectat === u.nume ? null : u.nume;
            actualizeazaStarePills();
            renderRezultate();
        });
        btn.dataset.val = u.nume;
        divUseri.appendChild(btn);
    });

    //  Categorii
    const divCat = document.getElementById("pills-categorii");
    const categoriiUnice = [...new Set((KB.fapte.produs || []).map(p => p.categorie))];
    categoriiUnice.forEach(cat => {
        const btn = creeazaPill(cap(cat), () => {
            state.categorieSelectata = state.categorieSelectata === cat ? null : cat;
            actualizeazaStarePills();
            renderRezultate();
        });
        btn.dataset.val = cat;
        divCat.appendChild(btn);
    });
}

function creeazaPill(text, onClick) {
    const btn = document.createElement("button");
    btn.className = "pill";
    btn.textContent = text;
    btn.addEventListener("click", onClick);
    return btn;
}

function actualizeazaStarePills() {
    document.querySelectorAll("#pills-reguli .pill").forEach(b => b.classList.toggle("active", b.dataset.val === state.regulaSelectata));
    document.querySelectorAll("#pills-useri .pill").forEach(b => b.classList.toggle("active", b.dataset.val === state.userSelectat));
    document.querySelectorAll("#pills-categorii .pill").forEach(b => b.classList.toggle("active", b.dataset.val === state.categorieSelectata));
}

function renderRezultate() {
    const grid = document.getElementById("results-grid");
    const countSpan = document.getElementById("results-count");
    const insight = document.getElementById("selected-insight");

    // Împărțim căutarea naturală în cuvinte cheie relevante (ignorând cuvinte de legătură)
    const stopWords = ["pentru", "care", "este", "sunt", "din", "sau", "cum", "cine", "are", "cei", "mai"];
    const cuvinteCautate = normalizeText(state.searchText)
        .split(/\s+/)
        .filter(w => w.length > 1 && !stopWords.includes(w));

    const filtrate = KB.carduriDeduse.filter(card => {
        if (state.regulaSelectata && card.regula !== state.regulaSelectata) return false;
        if (state.userSelectat && card.user !== state.userSelectat) return false;
        if (state.categorieSelectata && card.categorie !== state.categorieSelectata) return false;

        if (cuvinteCautate.length > 0) {
            return cuvinteCautate.every(cuvant => card.searchIndex.includes(cuvant));
        }
        return true;
    });

    countSpan.innerHTML = `<strong>${filtrate.length}</strong> ${filtrate.length === 1 ? "rezultat dedus" : "rezultate deduse"}`;

    if (filtrate.length === 0) {
        state.cardSelectat = null;
        insight.hidden = true;
        grid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1 / -1; text-align: center; padding: 40px 0;">Nicio concluzie nu corespunde criteriilor selectate. Încearcă să resetezi filtrele.</p>`;
        return;
    }

    if (!filtrate.includes(state.cardSelectat)) state.cardSelectat = null;

    grid.innerHTML = filtrate.map((card, index) => `
        <article class="card${state.cardSelectat === card ? " selected" : ""}" tabindex="0" role="button" aria-pressed="${state.cardSelectat === card}" data-card-index="${index}">
            <div>
                <div class="card-badges">
                    <span class="badge-green">${card.regulaLabel}</span>
                    ${card.regulaId ? `<span class="badge-neutral">${card.regulaId}</span>` : ""}
                    ${card.user ? `<span class="badge-neutral">Client: ${cap(card.user)}</span>` : ""}
                    ${card.categorie ? `<span class="badge-neutral">${cap(card.categorie)}</span>` : ""}
                </div>
                <h3 class="card-title">${card.titlu}</h3>
                <p class="card-desc">${card.descriere}</p>
            </div>
            <div class="card-tags">${card.tags.join(" ")}</div>
        </article>
    `).join("");

    grid.querySelectorAll(".card").forEach((element, index) => {
        const selecteazaCardul = () => {
            state.cardSelectat = state.cardSelectat === filtrate[index] ? null : filtrate[index];
            renderRezultate();
        };
        element.addEventListener("click", selecteazaCardul);
        element.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selecteazaCardul();
            }
        });
    });

    if (state.cardSelectat) {
        const card = state.cardSelectat;
        document.getElementById("insight-title").textContent = card.titlu;
        document.getElementById("insight-description").textContent = card.descriere;
        document.getElementById("insight-rule").textContent = card.regulaSursa
            ? descrieRegula(card.regulaSursa)
            : `Concluzie: ${card.regula}`;
        document.getElementById("insight-facts").textContent =
            `Context: ${card.tags.map(tag => tag.slice(1).replace(/_/g, " ")).join(" · ")}`;
        insight.hidden = false;
    } else {
        insight.hidden = true;
    }
}

function descrieRegula(regula) {
    const conditii = regula.conditii.map(conditie => {
        const atribut = conditie.camp ? `.${conditie.camp}` : "";
        const valoare = conditie.valoare == null ? "" : ` ${conditie.valoare}`;
        return `${conditie.nume}${atribut} ${conditie.op || ""}${valoare}`.trim();
    }).join(" AND ");
    return `${regula.id}: IF ${conditii} THEN ${regula.concluzie}`;
}

// Evenimente căutare în timp real & Reset
document.getElementById("natural-search").addEventListener("input", (e) => {
    state.searchText = e.target.value;
    renderRezultate();
});

document.getElementById("btn-clear").addEventListener("click", () => {
    state.searchText = "";
    state.regulaSelectata = null;
    state.userSelectat = null;
    state.categorieSelectata = null;
    state.cardSelectat = null;
    document.getElementById("natural-search").value = "";
    actualizeazaStarePills();
    renderRezultate();
});

function populeazaInspector(totalFapte) {
    document.getElementById("count-reguli").textContent = KB.reguli.length;
    document.getElementById("count-fapte").textContent = totalFapte;

    document.getElementById("lista-reguli-xml").innerHTML = KB.reguli.map(r => {
        const cond = r.conditii.map(c => `${c.nume}${c.camp ? "." + c.camp : ""} ${c.op || ""}`).join(" AND ");
        return `<li><strong>[${r.id}]</strong> IF ${cond} THEN <strong>${r.concluzie}</strong></li>`;
    }).join("");

    const fapteHTML = [];
    Object.entries(KB.fapte).forEach(([tip, lista]) => {
        lista.forEach(obj => fapteHTML.push(`<li><strong>${tip}</strong>(${Object.values(obj).join(", ")})</li>`));
    });
    document.getElementById("lista-fapte-xml").innerHTML = fapteHTML.join("");
}

init();