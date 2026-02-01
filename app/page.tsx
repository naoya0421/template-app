"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Vars = Record<string, string>;

type Template = {
  id: string;
  title: string;
  body: string;
  vars: Vars; // テンプレ固有の変数
};

type Profile = {
  id: string;
  title: string;
  vars: Vars; // 署名セット（共通）の変数
};

const STORAGE_KEY = "template_app_v2";

// {{ 変数名 }} を拾う
const PLACEHOLDER_RE = /{{\s*([^{}]+?)\s*}}/g;

const DEFAULT_TEMPLATE_BODY = `{{宛名}} 様

お世話になっております。{{案件名}}の件でご連絡です。
出演者は{{出演者}}です。

【日付】{{日付}}
【会場】{{会場}}
【当日連絡先】{{電話番号}}

よろしくお願いいたします。
{{自分の名前}}`;

const DEFAULT_TEMPLATE_VARS: Vars = {
  宛名: "",
  案件名: "",
  出演者: "",
  日付: "",
  会場: "",
};

const DEFAULT_PROFILE_VARS: Vars = {
  電話番号: "",
  "自分の名前": "",
  email: "",
};

const DEFAULT_PROFILE_KEYS = ["電話番号", "自分の名前", "email"]; // 最初は署名扱いにしたいキー

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function extractPlaceholders(text: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
    const key = m[1].trim();
    if (key) set.add(key);
  }
  return Array.from(set);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderTemplate(body: string, merged: Vars): string {
  return body.replace(PLACEHOLDER_RE, (_, rawKey: string) => {
    const key = String(rawKey).trim();
    return merged[key] ?? "";
  });
}

/** 初期化用のデフォルト状態を生成 */
function makeDefaultState() {
  const t0: Template = {
    id: "t_" + uid(),
    title: "出演者向け：基本",
    body: DEFAULT_TEMPLATE_BODY,
    vars: { ...DEFAULT_TEMPLATE_VARS },
  };

  const p0: Profile = {
    id: "p_" + uid(),
    title: "自分：デフォルト",
    vars: { ...DEFAULT_PROFILE_VARS },
  };

  return {
    templates: [t0],
    activeTemplateId: t0.id,
    profiles: [p0],
    activeProfileId: p0.id,
    profileKeys: [...DEFAULT_PROFILE_KEYS],
  };
}

export default function Page() {
  // ---- state: templates / profiles / profileKeys ----
  const [templates, setTemplates] = useState<Template[]>([
    {
      id: "t_" + uid(),
      title: "出演者向け：基本",
      body: DEFAULT_TEMPLATE_BODY,
      vars: { ...DEFAULT_TEMPLATE_VARS },
    },
  ]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>(() => ""); // 初回は後で埋める

  const [profiles, setProfiles] = useState<Profile[]>([
    { id: "p_" + uid(), title: "自分：デフォルト", vars: { ...DEFAULT_PROFILE_VARS } },
  ]);
  const [activeProfileId, setActiveProfileId] = useState<string>(() => "");

  // このキーは「署名セット側」に保存する（テンプレを跨いで共通）
  const [profileKeys, setProfileKeys] = useState<string[]>([...DEFAULT_PROFILE_KEYS]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ---- derived: active template/profile ----
  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) ?? templates[0],
    [templates, activeTemplateId]
  );

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0],
    [profiles, activeProfileId]
  );

  // 初回 activeId を埋める（ロード前の空を防ぐ）
  useEffect(() => {
    if (!activeTemplateId && templates[0]) setActiveTemplateId(templates[0].id);
    if (!activeProfileId && profiles[0]) setActiveProfileId(profiles[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- persistence: load ----
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const data = JSON.parse(saved);

      if (Array.isArray(data.templates) && data.templates.length > 0) setTemplates(data.templates);
      if (typeof data.activeTemplateId === "string") setActiveTemplateId(data.activeTemplateId);

      if (Array.isArray(data.profiles) && data.profiles.length > 0) setProfiles(data.profiles);
      if (typeof data.activeProfileId === "string") setActiveProfileId(data.activeProfileId);

      if (Array.isArray(data.profileKeys)) setProfileKeys(data.profileKeys);
    } catch {}
  }, []);

  // ---- persistence: save ----
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          templates,
          activeTemplateId,
          profiles,
          activeProfileId,
          profileKeys,
        })
      );
    } catch {}
  }, [templates, activeTemplateId, profiles, activeProfileId, profileKeys]);

  // ---- placeholders from active body ----
  const keysInBody = useMemo(() => extractPlaceholders(activeTemplate?.body ?? ""), [activeTemplate?.body]);

  // ---- ensure vars exist depending on profileKeys ----
  useEffect(() => {
    if (!activeTemplate || !activeProfile) return;

    // 1) active template vars ensure
    setTemplates((prev) =>
      prev.map((t) => {
        if (t.id !== activeTemplate.id) return t;
        const nextVars: Vars = { ...t.vars };
        let changed = false;

        for (const k of keysInBody) {
          // 署名キーならテンプレ側に持たない（不要）
          if (profileKeys.includes(k)) continue;
          if (!(k in nextVars)) {
            nextVars[k] = "";
            changed = true;
          }
        }
        return changed ? { ...t, vars: nextVars } : t;
      })
    );

    // 2) active profile vars ensure
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== activeProfile.id) return p;
        const nextVars: Vars = { ...p.vars };
        let changed = false;

        for (const k of keysInBody) {
          if (!profileKeys.includes(k)) continue;
          if (!(k in nextVars)) {
            nextVars[k] = "";
            changed = true;
          }
        }
        return changed ? { ...p, vars: nextVars } : p;
      })
    );
  }, [keysInBody, profileKeys, activeTemplate?.id, activeProfile?.id]);

  // ---- merged vars for preview ----
  const mergedVars = useMemo(() => {
    const tv = activeTemplate?.vars ?? {};
    const pv = activeProfile?.vars ?? {};
    // 署名セットが優先（上書き）
    return { ...tv, ...pv };
  }, [activeTemplate?.vars, activeProfile?.vars]);

  const preview = useMemo(
    () => renderTemplate(activeTemplate?.body ?? "", mergedVars),
    [activeTemplate?.body, mergedVars]
  );

  // ---- helpers: update active template/profile ----
  const setActiveTemplateBody = (body: string) => {
    if (!activeTemplate) return;
    setTemplates((prev) => prev.map((t) => (t.id === activeTemplate.id ? { ...t, body } : t)));
  };

  const updateVarValue = (key: string, value: string) => {
    if (!activeTemplate || !activeProfile) return;

    const isSig = profileKeys.includes(key);

    if (isSig) {
      // 署名セット側に保存
      setProfiles((prev) =>
        prev.map((p) => (p.id === activeProfile.id ? { ...p, vars: { ...p.vars, [key]: value } } : p))
      );
    } else {
      // テンプレ側に保存
      setTemplates((prev) =>
        prev.map((t) => (t.id === activeTemplate.id ? { ...t, vars: { ...t.vars, [key]: value } } : t))
      );
    }
  };

  const addVarToGroup = () => {
    const name = prompt("追加する変数名（例：出演者、振込期限、集合時間）");
    if (!name) return;
    const key = name.trim();
    if (!key) return;

    // 既に存在チェック（テンプレ・プロフィール・署名キー）
    const existsInTemplate = activeTemplate?.vars && key in activeTemplate.vars;
    const existsInProfile = activeProfile?.vars && key in activeProfile.vars;
    const isSig = profileKeys.includes(key);

    if (existsInTemplate || existsInProfile || isSig) {
      alert("その変数はすでにあります（テンプレ or 署名セット）");
      return;
    }

    // 追加は「テンプレ側」に（本文は変更しない）
    if (!activeTemplate) return;
    setTemplates((prev) =>
      prev.map((t) => (t.id === activeTemplate.id ? { ...t, vars: { ...t.vars, [key]: "" } } : t))
    );
  };

  const insertPlaceholder = (key: string) => {
    const el = textareaRef.current;
    const token = `{{${key}}}`;

    const body = activeTemplate?.body ?? "";
    if (!activeTemplate) return;

    if (!el) {
      setActiveTemplateBody(body + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;

    const next = body.slice(0, start) + token + body.slice(end);
    setActiveTemplateBody(next);

    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const toggleSignatureKey = (key: string, checked: boolean) => {
    if (!activeTemplate || !activeProfile) return;

    const currentlySig = profileKeys.includes(key);
    if (checked === currentlySig) return;

    if (checked) {
      // テンプレ → 署名セットへ移動（値を引き継ぐ）
      const currentValue = activeTemplate.vars?.[key] ?? mergedVars[key] ?? "";
      setProfileKeys((prev) => [...prev, key]);

      // 署名セットに値をセット
      setProfiles((prev) =>
        prev.map((p) => (p.id === activeProfile.id ? { ...p, vars: { ...p.vars, [key]: currentValue } } : p))
      );

      // テンプレ側から削除
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.id !== activeTemplate.id) return t;
          const nextVars = { ...t.vars };
          delete nextVars[key];
          return { ...t, vars: nextVars };
        })
      );
    } else {
      // 署名セット → テンプレへ移動（値を引き継ぐ）
      const currentValue = activeProfile.vars?.[key] ?? mergedVars[key] ?? "";
      setProfileKeys((prev) => prev.filter((k) => k !== key));

      // テンプレに値をセット
      setTemplates((prev) =>
        prev.map((t) => (t.id === activeTemplate.id ? { ...t, vars: { ...t.vars, [key]: currentValue } } : t))
      );

      // 署名セット側から削除
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== activeProfile.id) return p;
          const nextVars = { ...p.vars };
          delete nextVars[key];
          return { ...p, vars: nextVars };
        })
      );
    }
  };

  const deleteVar = (key: string) => {
    if (!activeTemplate || !activeProfile) return;

    const usedInBody = keysInBody.includes(key);

    if (usedInBody) {
      const ok = confirm(`「${key}」は本文で使用中です。\n本文中の {{${key}}} も削除して、変数も削除しますか？`);
      if (!ok) return;

      const re = new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "g");
      setActiveTemplateBody((activeTemplate.body ?? "").replace(re, ""));
    } else {
      const ok = confirm(`変数「${key}」を削除しますか？`);
      if (!ok) return;
    }

    // 署名キー設定からも削除
    setProfileKeys((prev) => prev.filter((k) => k !== key));

    // テンプレ側から削除
    setTemplates((prev) =>
      prev.map((t) => {
        if (t.id !== activeTemplate.id) return t;
        const nextVars = { ...t.vars };
        delete nextVars[key];
        return { ...t, vars: nextVars };
      })
    );

    // 現在の署名セットから削除
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== activeProfile.id) return p;
        const nextVars = { ...p.vars };
        delete nextVars[key];
        return { ...p, vars: nextVars };
      })
    );
  };

  const copyPreview = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      alert("コピーしました");
    } catch {
      alert("コピーに失敗しました（ブラウザ権限を確認してください）");
    }
  };

  /** 3種の初期化（分ける） */

  // 現在のテンプレだけ初期化（タイトルは残す）
  const resetCurrentTemplate = () => {
    if (!activeTemplate) return;

    const ok = confirm(`現在のテンプレ「${activeTemplate.title}」を初期化しますか？\n（本文・テンプレ変数が初期状態に戻ります）`);
    if (!ok) return;

    // 署名キーはテンプレ側に持たないようにする
    const baseVars: Vars = { ...DEFAULT_TEMPLATE_VARS };
    for (const k of profileKeys) delete baseVars[k];

    setTemplates((prev) =>
      prev.map((t) =>
        t.id === activeTemplate.id
          ? {
              ...t,
              body: DEFAULT_TEMPLATE_BODY,
              vars: baseVars,
            }
          : t
      )
    );
  };

  // 現在の署名セットだけ初期化（タイトルは残す）
  const resetCurrentProfile = () => {
    if (!activeProfile) return;

    const ok = confirm(`現在の署名セット「${activeProfile.title}」を初期化しますか？\n（署名変数の値が空になります）`);
    if (!ok) return;

    const nextVars: Vars = {};
    for (const k of profileKeys) nextVars[k] = "";

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === activeProfile.id
          ? {
              ...p,
              vars: nextVars,
            }
          : p
      )
    );
  };

  // 全部初期化（保存データも含めて）
  const resetAll = () => {
    const ok = confirm("すべて初期化しますか？（テンプレ/署名セット/変数/保存データが初期状態に戻ります）");
    if (!ok) return;

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}

    const init = makeDefaultState();
    setTemplates(init.templates);
    setActiveTemplateId(init.activeTemplateId);
    setProfiles(init.profiles);
    setActiveProfileId(init.activeProfileId);
    setProfileKeys(init.profileKeys);
  };

  // ---- Template CRUD ----
  const createTemplate = () => {
    const title = prompt("新しいテンプレ名");
    if (!title) return;
    const t: Template = {
      id: "t_" + uid(),
      title: title.trim() || "新規テンプレ",
      body: DEFAULT_TEMPLATE_BODY,
      vars: { ...DEFAULT_TEMPLATE_VARS },
    };
    setTemplates((prev) => [t, ...prev]);
    setActiveTemplateId(t.id);
  };

  const duplicateTemplate = () => {
    if (!activeTemplate) return;
    const title = prompt("複製テンプレ名", activeTemplate.title + "（複製）");
    if (!title) return;
    const t: Template = {
      id: "t_" + uid(),
      title: title.trim() || activeTemplate.title + "（複製）",
      body: activeTemplate.body,
      vars: { ...activeTemplate.vars },
    };
    setTemplates((prev) => [t, ...prev]);
    setActiveTemplateId(t.id);
  };

  const renameTemplate = () => {
    if (!activeTemplate) return;
    const title = prompt("テンプレ名を変更", activeTemplate.title);
    if (!title) return;
    setTemplates((prev) => prev.map((t) => (t.id === activeTemplate.id ? { ...t, title: title.trim() || t.title } : t)));
  };

  const deleteTemplate = () => {
    if (!activeTemplate) return;
    if (templates.length <= 1) {
      alert("テンプレは最低1つ必要です。");
      return;
    }
    const ok = confirm(`テンプレ「${activeTemplate.title}」を削除しますか？`);
    if (!ok) return;

    const remaining = templates.filter((t) => t.id !== activeTemplate.id);
    setTemplates(remaining);
    setActiveTemplateId(remaining[0].id);
  };

  // ---- Profile CRUD ----
  const createProfile = () => {
    const title = prompt("新しい署名セット名（例：自分/業者用/サークル用）");
    if (!title) return;
    const p: Profile = {
      id: "p_" + uid(),
      title: title.trim() || "新規署名セット",
      vars: { ...DEFAULT_PROFILE_VARS },
    };
    setProfiles((prev) => [p, ...prev]);
    setActiveProfileId(p.id);
  };

  const renameProfile = () => {
    if (!activeProfile) return;
    const title = prompt("署名セット名を変更", activeProfile.title);
    if (!title) return;
    setProfiles((prev) => prev.map((p) => (p.id === activeProfile.id ? { ...p, title: title.trim() || p.title } : p)));
  };

  const deleteProfile = () => {
    if (!activeProfile) return;
    if (profiles.length <= 1) {
      alert("署名セットは最低1つ必要です。");
      return;
    }
    const ok = confirm(`署名セット「${activeProfile.title}」を削除しますか？`);
    if (!ok) return;

    const remaining = profiles.filter((p) => p.id !== activeProfile.id);
    setProfiles(remaining);
    setActiveProfileId(remaining[0].id);
  };

  // ---- Variable list keys (template vars + profile vars + keys in body) ----
  const allVarKeys = useMemo(() => {
    const set = new Set<string>();
    // 本文に出てくるもの
    for (const k of keysInBody) set.add(k);
    // テンプレ固有
    for (const k of Object.keys(activeTemplate?.vars ?? {})) set.add(k);
    // 署名セット
    for (const k of Object.keys(activeProfile?.vars ?? {})) set.add(k);
    // 署名キー設定に入ってるもの（値が空でも）
    for (const k of profileKeys) set.add(k);

    const keys = Array.from(set);

    // 並び：本文使用中→署名→その他
    return keys.sort((a, b) => {
      const aUsed = keysInBody.includes(a) ? 0 : 1;
      const bUsed = keysInBody.includes(b) ? 0 : 1;
      if (aUsed !== bUsed) return aUsed - bUsed;

      const aSig = profileKeys.includes(a) ? 0 : 1;
      const bSig = profileKeys.includes(b) ? 0 : 1;
      if (aSig !== bSig) return aSig - bSig;

      return a.localeCompare(b, "ja");
    });
  }, [keysInBody, activeTemplate?.vars, activeProfile?.vars, profileKeys]);

  return (
    <div className="container">
      {/* ====== Header ====== */}
      <div className="headerRow">
        <h1 className="h1">連絡テンプレ集（テンプレ複数 + 署名セット）</h1>
        <div className="headerButtons">
          <button onClick={resetCurrentTemplate} className="btn" title="現在のテンプレ本文・テンプレ変数を初期化">
            テンプレ初期化
          </button>
          <button onClick={resetCurrentProfile} className="btn" title="現在の署名セットの値を初期化（空に戻す）">
            署名初期化
          </button>
          <button onClick={resetAll} className="btn" title="保存データ含めて全部初期状態に戻す">
            全部初期化
          </button>
        </div>
      </div>

      {/* ====== Top controls ====== */}
      <div className="topControls">
        {/* Template control */}
        <div className="panel">
          <div className="panelTitle">テンプレ</div>
          <div className="rowWrap">
            <select value={activeTemplate?.id ?? ""} onChange={(e) => setActiveTemplateId(e.target.value)} className="select">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>

            <button onClick={createTemplate} className="btn">
              新規
            </button>
            <button onClick={duplicateTemplate} className="btn">
              複製
            </button>
            <button onClick={renameTemplate} className="btn">
              名前変更
            </button>
            <button onClick={deleteTemplate} className="btn">
              削除
            </button>
          </div>
        </div>

        {/* Profile control */}
        <div className="panel">
          <div className="panelTitle">署名セット</div>
          <div className="rowWrap">
            <select value={activeProfile?.id ?? ""} onChange={(e) => setActiveProfileId(e.target.value)} className="select">
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>

            <button onClick={createProfile} className="btn">
              新規
            </button>
            <button onClick={renameProfile} className="btn">
              名前変更
            </button>
            <button onClick={deleteProfile} className="btn">
              削除
            </button>
          </div>
          <div className="helpText">
            変数の「署名」チェックONにすると、この署名セットに値が保存されます（テンプレ間で共通化）。
          </div>
        </div>
      </div>

      {/* ====== Main area ====== */}
      <div className="mainArea">
        {/* Body */}
        <div>
          <div className="sectionTitle">テンプレ本文</div>
          <textarea
            ref={textareaRef}
            value={activeTemplate?.body ?? ""}
            onChange={(e) => setActiveTemplateBody(e.target.value)}
            rows={18}
            className="textarea"
          />
          <div className="helpText">
            本文に <code>{"{{変数名}}"}</code> を書くと置換されます。右の「挿入」でカーソル位置に入れられます。
          </div>
        </div>

        {/* Variables */}
        <div>
          <div className="varsHeader">
            <div className="sectionTitle" style={{ margin: 0 }}>
              変数グループ
            </div>
            <button onClick={addVarToGroup} className="btn">
              変数を追加
            </button>
          </div>

          <div className="varsBox">
            {allVarKeys.map((k) => {
              const isUsed = keysInBody.includes(k);
              const isSig = profileKeys.includes(k);
              const value = mergedVars[k] ?? "";

              return (
                <div key={k} className="varRow">
                  <div className="varMain">
                    <div className="varMeta">
                      <div className="varLabel">
                        <b>{k}</b>{" "}
                        {isUsed ? <span className="used">（本文で使用中）</span> : <span className="unused">（未使用）</span>}
                      </div>

                      <label className="sigToggle">
                        <input type="checkbox" checked={isSig} onChange={(e) => toggleSignatureKey(k, e.target.checked)} />
                        署名
                      </label>
                    </div>

                    <input
                      value={value}
                      onChange={(e) => updateVarValue(k, e.target.value)}
                      placeholder={`例：${k} の値`}
                      className="input"
                    />
                    <div className="saveTo">
                      保存先：{isSig ? `署名セット「${activeProfile?.title ?? ""}」` : `テンプレ「${activeTemplate?.title ?? ""}」`}
                    </div>
                  </div>

                  <button onClick={() => insertPlaceholder(k)} className="smallBtn" title="本文のカーソル位置に挿入">
                    挿入
                  </button>

                  <button onClick={() => deleteVar(k)} className="smallBtn" title="変数を削除（必要なら本文の {{}} も削除）">
                    削除
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ====== Preview ====== */}
      <div className="previewArea">
        <div className="previewHeader">
          <div className="sectionTitle" style={{ margin: 0 }}>
            プレビュー（置換後）
          </div>
          <button onClick={copyPreview} className="btn">
            コピー
          </button>
        </div>

        <pre className="previewBox">{preview}</pre>
      </div>

      {/* ====== styles (スマホ対応) ====== */}
      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 24px auto;
          padding: 16px;
          font-family: system-ui;
        }

        .headerRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .h1 {
          font-size: 22px;
          font-weight: 700;
          margin: 0;
        }
        .headerButtons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .topControls {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }

        .panel {
          border: 1px solid #ddd;
          border-radius: 12px;
          padding: 12px;
        }
        .panelTitle {
          font-weight: 700;
          margin-bottom: 8px;
        }

        .rowWrap {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        .select {
          padding: 8px 10px;
          border: 1px solid #ccc;
          border-radius: 10px;
          min-width: 260px;
        }

        .mainArea {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 16px;
        }

        .sectionTitle {
          font-weight: 700;
          margin-bottom: 8px;
        }

        .textarea {
          width: 100%;
          border: 1px solid #ccc;
          border-radius: 12px;
          padding: 12px;
          line-height: 1.6;
        }

        .varsHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          gap: 8px;
          flex-wrap: wrap;
        }

        .varsBox {
          border: 1px solid #ccc;
          border-radius: 12px;
          padding: 12px;
          max-height: 440px;
          overflow: auto;
        }

        .varRow {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 8px;
          margin-bottom: 10px;
          align-items: end;
        }

        .varMain {
          min-width: 0;
        }

        .varMeta {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
          flex-wrap: wrap;
        }

        .varLabel {
          font-size: 12px;
          color: #333;
        }

        .used {
          color: #0a7;
        }
        .unused {
          color: #888;
        }

        .sigToggle {
          font-size: 12px;
          color: #444;
          display: flex;
          gap: 6px;
          align-items: center;
          user-select: none;
        }

        .input {
          width: 100%;
          border: 1px solid #ccc;
          border-radius: 10px;
          padding: 8px 10px;
        }

        .saveTo {
          font-size: 11px;
          color: #666;
          margin-top: 3px;
        }

        .previewArea {
          margin-top: 16px;
        }
        .previewHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          gap: 8px;
          flex-wrap: wrap;
        }

        .previewBox {
          white-space: pre-wrap;
          border: 1px solid #ccc;
          border-radius: 12px;
          padding: 12px;
          line-height: 1.6;
          background: #fafafa;
        }

        .helpText {
          margin-top: 8px;
          font-size: 12px;
          color: #555;
        }

        .btn {
          padding: 8px 12px;
          border: 1px solid #ccc;
          border-radius: 10px;
          cursor: pointer;
          background: white;
        }

        .smallBtn {
          height: 36px;
          padding: 0 10px;
          border: 1px solid #ccc;
          border-radius: 10px;
          cursor: pointer;
          background: white;
          white-space: nowrap;
        }

        /* ===== スマホ最適化 ===== */
        @media (max-width: 900px) {
          .topControls {
            grid-template-columns: 1fr;
          }
          .mainArea {
            grid-template-columns: 1fr;
          }
          .select {
            min-width: 0;
            width: 100%;
          }
          .varsBox {
            max-height: none; /* スマホは高さ制限を外す */
          }
        }

        /* さらに小さい画面：ボタンを押しやすく */
        @media (max-width: 480px) {
          .headerButtons {
            width: 100%;
          }
          .headerButtons > :global(button) {
            flex: 1 1 auto;
          }
          .varRow {
            grid-template-columns: 1fr;
          }
          .smallBtn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
