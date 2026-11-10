import { useEffect, useRef, useState } from "react";
import { Community } from "../community/community";
import { abilities, calculate, modifier, newCharacter, parseCharacter, serializeCharacter, signed } from "../character/character";
import type { Character } from "../character/character";

export function meta() {
  return [{ title: "Oathkeeper • Character workshop" }, { name: "description", content: "Build the foundations of your 2014 fifth edition character." }];
}

function NumberField({ label, value, min, max, change }: { label: string; value: number; min: number; max: number; change: (value: number) => void }) {
  return <label>{label}<input type="number" required min={min} max={max} step="1" defaultValue={value} onChange={event => {
    if (event.currentTarget.validity.valid) change(event.currentTarget.valueAsNumber);
  }} /></label>;
}

export default function Home() {
  const [tab, setTab] = useState<"character" | "community">("character");
  const [character, setCharacter] = useState(newCharacter);
  const [pending, setPending] = useState<Character | null>(null);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [valid, setValid] = useState(true);
  const [revision, setRevision] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const review = useRef<HTMLDivElement>(null);
  const results = calculate(character);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('community') === '1') setTab('community'); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { if (pending) review.current?.focus(); }, [pending]);
  function update(patch: Partial<Character>) {
    setCharacter(current => ({ ...current, ...patch }));
    setDirty(true);
    setMessage("");
  }
  function download() {
    if (!form.current?.reportValidity()) return;
    const url = URL.createObjectURL(new Blob([serializeCharacter(character)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "oathkeeper-character.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDirty(false);
    setMessage("Save file prepared. Keep the downloaded file to restore your character later.");
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    setPending(null);
    setMessage("");
    try { setPending(parseCharacter(await file.text())); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The file could not be read. Your current character has not changed."); }
  }
  return <div className="shell">
    <header className="topbar"><a className="brand" href="/">✧ OATHKEEPER</a><span>Character workshop <span className="badge">Early build</span></span></header>
    <nav className="section-tabs" aria-label="App sections"><button type="button" aria-pressed={tab === "character"} aria-controls="character-section" onClick={() => setTab("character")}>Character workshop</button><button type="button" aria-pressed={tab === "community"} aria-controls="community-section" onClick={() => setTab("community")}>Community</button></nav>
    <main>
      <div id="community-section" hidden={tab !== "community"}><Community /></div>
      <div id="character-section" hidden={tab !== "character"}>
      <div className="intro"><p className="eyebrow">YOUR NEXT ADVENTURE STARTS HERE</p><h1>Every hero starts<br />with a story.</h1><p>Give yours a name. Build their foundation.<br />Keep the details close when the dice start rolling.</p></div>
      <div className="workspace-heading"><div><p className="eyebrow">2014 FIFTH EDITION</p><h2>Character worksheet</h2></div><div className="actions"><button type="button" onClick={() => fileInput.current?.click()}>Restore a save</button><button className="primary" type="button" onClick={download}>Download character</button><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /></div></div>
      <p className="notice">{dirty ? "You have changes to download. " : "This worksheet stays in this tab only. "}Download a save before leaving. Online character saving is not available yet. Community accounts do not save this worksheet.</p>
      <p role="status" className="status">{message}</p>
      {pending && <div className="panel review" ref={review} tabIndex={-1}>
        <p className="eyebrow">REVIEW YOUR SAVE</p><h2>{pending.name || "Unnamed character"}</h2>
        <p>Level {pending.level} · {pending.className || "No class entered"} · {pending.ancestry || "No race / ancestry entered"}</p>
        <ul>{abilities.map(name => <li key={name}>{name}: {pending.abilities[name].score} · {pending.abilities[name].proficient ? "proficient save" : "not proficient"} · save adjustment {signed(pending.abilities[name].saveAdjustment)}</li>)}</ul>
        <p>Initiative adjustment: {signed(pending.initiativeAdjustment)}</p><p className="notes-preview">{pending.notes || "No manual notes."}</p>
        <p>This will replace the current worksheet{dirty ? ", including changes you have not downloaded" : ""}. You can edit all fields after restoring.</p>
        <div className="actions"><button className="primary" onClick={() => { setCharacter(pending); setPending(null); setRevision(value => value + 1); setDirty(false); setValid(true); setMessage("Character restored. You can now review and edit the worksheet."); }}>Replace worksheet</button><button onClick={() => { setPending(null); setMessage("Restore cancelled. Your worksheet has not changed."); }}>Cancel</button></div>
      </div>}
      <div className="workspace">
        <form ref={form} key={revision} onSubmit={event => event.preventDefault()} onChange={() => { setValid(form.current?.checkValidity() ?? true); setDirty(true); }}>
          <section className="panel"><p className="eyebrow">01 / THE CHARACTER</p><h2>A name to remember</h2><div className="identity-fields">
            <label className="wide">Character name<input value={character.name} placeholder="Your character’s name" onChange={event => update({ name: event.target.value })} /></label>
            <label>Class · manual<input value={character.className} placeholder="e.g. Fighter" onChange={event => update({ className: event.target.value })} /></label>
            <label>Race / ancestry · manual<input value={character.ancestry} placeholder="e.g. Human" onChange={event => update({ ancestry: event.target.value })} /></label>
            <NumberField label="Total level" value={character.level} min={1} max={20} change={level => update({ level })} />
          </div><p className="hint">Class and ancestry are notes only. Their features, bonuses, and saving throw proficiencies are not applied automatically. Changing level updates proficiency only.</p></section>
          <section className="panel"><p className="eyebrow">02 / THE FOUNDATION</p><h2>Abilities & saving throws</h2><p>Enter final ability scores, including any bonuses from your character options. Mark the saving throws your character is proficient in.</p>
            <div className="ability-grid">{abilities.map(name => {
              const entry = character.abilities[name];
              const change = (patch: Partial<typeof entry>) => update({ abilities: { ...character.abilities, [name]: { ...entry, ...patch } } });
              return <fieldset className="ability" key={name}><legend>{name}</legend><div className="score-row"><NumberField label="Score (1–30)" value={entry.score} min={1} max={30} change={score => change({ score })} /><div className="modifier"><strong>{signed(modifier(entry.score))}</strong><span>modifier</span></div></div>
                <label className="checkbox"><input type="checkbox" checked={entry.proficient} onChange={event => change({ proficient: event.target.checked })} />Proficient save</label>
                <NumberField label="Manual save adjustment" value={entry.saveAdjustment} min={-100} max={100} change={saveAdjustment => change({ saveAdjustment })} />
                <div className="save-total"><span>Saving throw</span><strong>{signed(results.saves[name])}</strong></div><p className="formula">{signed(modifier(entry.score))} ability + {entry.proficient ? results.proficiency : 0} proficiency + ({signed(entry.saveAdjustment)}) manual</p>
              </fieldset>;
            })}</div>
          </section>
          <section className="panel"><p className="eyebrow">03 / MAKE IT YOURS</p><h2>Manual adjustments & notes</h2><NumberField label="Initiative adjustment" value={character.initiativeAdjustment} min={-100} max={100} change={initiativeAdjustment => update({ initiativeAdjustment })} /><p className="hint">Add bonuses from features or other sources here. Manual adjustments accept whole numbers from −100 to 100.</p><label>Features, equipment, background & adjustment sources<textarea rows={6} value={character.notes} placeholder="Record unsupported features and explain your manual adjustments…" onChange={event => update({ notes: event.target.value })} /></label><p className="hint">Notes are preserved in your save. They do not change calculations.</p></section>
        </form>
        <aside><section className="panel summary"><p className="eyebrow">AT A GLANCE</p><h2>{character.name || "Your adventurer"}</h2><p>Level {character.level} · 2014 rules</p>{!valid && <p role="alert" className="notice">Correct the highlighted fields. Results use the last valid values; downloading is blocked until all fields are valid.</p>}<div className="summary-stat"><span>Proficiency bonus</span><strong>{signed(results.proficiency)}</strong></div><div className="summary-stat"><span>Initiative</span><strong>{signed(results.initiative)}</strong></div><p className="formula">{signed(modifier(character.abilities.Dexterity.score))} Dexterity + ({signed(character.initiativeAdjustment)}) manual</p><hr /><h3>What is automated?</h3><p>Ability modifiers, level-based proficiency, selected saving throws, and basic initiative.</p><h3>Still to come</h3><p>Guided creation and leveling, class and race features, skills, combat, spells, and PDF import with review.</p></section><section className="panel community"><p className="eyebrow">BEYOND THE CHARACTER SHEET</p><h2>A place for your party.</h2><p>Share posts and files, join private gaming groups, and exchange messages in the Community tab. Sign in there to connect with your party.</p><button type="button" onClick={() => { setTab("community"); window.scrollTo({ top: 0 }); }}>Open Community</button></section></aside>
      </div>
      </div>
    </main>
    <footer><p>Oathkeeper · A character’s story, kept close.</p><details><summary>Rules source & attribution</summary><p>This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at <a href="https://dnd.wizards.com/resources/systems-reference-document">https://dnd.wizards.com/resources/systems-reference-document</a>. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at <a href="https://creativecommons.org/licenses/by/4.0/legalcode">https://creativecommons.org/licenses/by/4.0/legalcode</a>.</p><p>Selected rules are adapted into calculations and original interface explanations. Full Player’s Handbook content is not included.</p></details></footer>
  </div>;
}
