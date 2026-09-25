"""api/main.py — Next.js に SSE でエージェントの経過を配信する FastAPI。

  uvicorn api.main:app --port 8000

エージェント本体（app/agent.py、app/tools.py、app/guards.py）はそのまま使う。
ここがやるのは「HTTP と SSE への変換」と「セッションごとの質問数の制限」だけ。
"""
from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Iterator

from dotenv import load_dotenv

load_dotenv()

from fastapi import Cookie, FastAPI, Response  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from app.agent import Agent  # noqa: E402
from app.guards import RateLimit  # noqa: E402
from app.tools import log_event  # noqa: E402

MAX_QUESTIONS = int(os.getenv("MAX_QUESTIONS_PER_SESSION", "20"))
SESSION_COOKIE = "partd_session"
SESSION_TTL_SEC = 60 * 60 * 6

MODELS = {
    "sonnet": {"id": "claude-sonnet-5", "label": "Claude Sonnet 5",
               "note": "既定", "noteEn": "default"},
    "opus": {"id": "claude-opus-5", "label": "Claude Opus 5",
             "note": "賢い・高い", "noteEn": "smarter, pricier"},
    "haiku": {"id": "claude-haiku-4-5", "label": "Claude Haiku 4.5",
              "note": "速い・安い", "noteEn": "faster, cheaper"},
}

# 絞り込みの選択肢。実データから確認した値をそのまま使う
# （BigQuery を毎回引かずに済ませる。年次更新のたびに見直す）。
# 選択肢は (BigQuery に入っている値, 日本語ラベル, 英語ラベル)
SPECIALTIES = [
    ("Internal Medicine", "内科", "Internal Medicine"),
    ("Family Practice", "家庭医", "Family Practice"),
    ("Nurse Practitioner", "ナースプラクティショナー", "Nurse Practitioner"),
    ("Physician Assistant", "PA", "Physician Assistant"),
    ("Psychiatry", "精神科", "Psychiatry"),
    ("Cardiology", "循環器", "Cardiology"),
    ("Endocrinology", "内分泌", "Endocrinology"),
    ("Neurology", "脳神経内科", "Neurology"),
    ("Nephrology", "腎臓", "Nephrology"),
    ("Pulmonary Disease", "呼吸器", "Pulmonary Disease"),
    ("Gastroenterology", "消化器", "Gastroenterology"),
    ("Rheumatology", "リウマチ", "Rheumatology"),
    ("Geriatric Medicine", "老年科", "Geriatric Medicine"),
    ("Hematology-Oncology", "血液腫瘍", "Hematology-Oncology"),
    ("Dermatology", "皮膚科", "Dermatology"),
    ("Urology", "泌尿器", "Urology"),
    ("Ophthalmology", "眼科", "Ophthalmology"),
    ("Emergency Medicine", "救急", "Emergency Medicine"),
    ("General Practice", "一般医", "General Practice"),
]

DRUG_CLASSES = [
    ("GLP1", "GLP-1受容体作動薬", "GLP-1 receptor agonists"),
    ("SGLT2", "SGLT2阻害薬", "SGLT2 inhibitors"),
    ("DPP4", "DPP-4阻害薬", "DPP-4 inhibitors"),
    ("BIGUANIDE", "ビグアナイド", "Biguanides (metformin)"),
    ("SULFONYLUREA", "スルホニル尿素", "Sulfonylureas"),
    ("INSULIN", "インスリン", "Insulins"),
    ("DOAC", "DOAC（直接経口抗凝固薬）", "DOACs"),
    ("WARFARIN", "ワルファリン", "Warfarin"),
    ("STATIN", "スタチン", "Statins"),
    ("ARB", "ARB", "ARBs"),
    ("ACEI", "ACE阻害薬", "ACE inhibitors"),
    ("BETA_BLOCKER", "β遮断薬", "Beta blockers"),
    ("PPI", "PPI", "Proton pump inhibitors"),
    ("SSRI", "SSRI", "SSRIs"),
    ("SNRI", "SNRI", "SNRIs"),
    ("ATYPICAL_ANTIPSYCHOTIC", "非定型抗精神病薬", "Atypical antipsychotics"),
    ("ANTIDEMENTIA", "抗認知症薬", "Anti-dementia drugs"),
]

STATES = [
    ("California", "カリフォルニア", "California"), ("Texas", "テキサス", "Texas"),
    ("Florida", "フロリダ", "Florida"), ("New York", "ニューヨーク", "New York"),
    ("Pennsylvania", "ペンシルベニア", "Pennsylvania"), ("Illinois", "イリノイ", "Illinois"),
    ("Ohio", "オハイオ", "Ohio"), ("Georgia", "ジョージア", "Georgia"),
    ("North Carolina", "ノースカロライナ", "North Carolina"),
    ("Michigan", "ミシガン", "Michigan"), ("New Jersey", "ニュージャージー", "New Jersey"),
    ("Arizona", "アリゾナ", "Arizona"), ("Massachusetts", "マサチューセッツ", "Massachusetts"),
    ("Tennessee", "テネシー", "Tennessee"), ("Washington", "ワシントン", "Washington"),
]

POPULATIONS = [
    ("ge65", "65歳以上のみ", "Age 65 and over only"),
    ("lis", "低所得補助（LIS）対象", "Low-income subsidy (LIS)"),
    ("dual", "Medicaid 二重加入", "Medicare-Medicaid dual eligible"),
]

AREAS = [
    ("urban", "都市部（RUCA 1〜3）", "Urban (RUCA 1-3)"),
    ("rural", "地方（RUCA 7〜10）", "Rural (RUCA 7-10)"),
]

EXAMPLES = {
    "ja": [
        "GLP-1受容体作動薬の州別処方数を2022→2024で比較して",
        "2024年の総薬剤費トップ10の薬剤は？ブランド名ごとに",
        "フロリダ州の内科医でオピオイド処方が多い上位20（NPI）",
        "抗凝固薬（DOAC）の処方医数の年次推移",
        "州別の一人当たり薬剤費（費用÷受給者数）ランキング",
        "精神科医が最も処方する薬剤トップ10",
    ],
    "en": [
        "Compare GLP-1 receptor agonist prescriptions by state, 2022 vs 2024",
        "Top 10 drugs by total spending in 2024, by brand name",
        "Top 20 internal medicine physicians in Florida by opioid claims (with NPI)",
        "Yearly trend in the number of prescribers of DOACs",
        "States ranked by drug spending per beneficiary",
        "Top 10 drugs most prescribed by psychiatrists",
    ],
}

# 「何が聞けるか」を切り口ごとに見せる。Part D を知らない人が
# いきなり質問を書けるようにするための入口。
TOPICS = {
    "ja": [
        {"key": "trend", "title": "時系列で追う",
         "lead": "3年分あるので、増えている薬・減っている薬が分かります",
         "questions": [
             "GLP-1受容体作動薬の全国処方量は2022年から2024年でどう変わった？",
             "抗凝固薬（DOAC）の処方医数の年次推移を薬剤別に",
             "2022年から2024年で総薬剤費はどれだけ増えた？"]},
        {"key": "geo", "title": "地域で比べる",
         "lead": "50州＋DC 単位。地図で色分けして見られます",
         "questions": [
             "州別の一人当たり薬剤費ランキング",
             "オピオイド処方の請求数が多い州トップ10",
             "GLP-1受容体作動薬の州別処方数を2022→2024で比較して"]},
        {"key": "drug", "title": "薬剤を調べる",
         "lead": "一般名・ブランド名の両方で引けます。薬効クラスの辞書つき",
         "questions": [
             "2024年の総薬剤費トップ10の薬剤は？ブランド名ごとに",
             "オゼンピックの処方医数は2022年から2024年でどれだけ増えた？",
             "2024年に最も処方回数が多かった薬剤トップ10（一般名で集計）"]},
        {"key": "prescriber", "title": "処方する医師を見る",
         "lead": "専門科・所在地・患者集団の属性が付いています",
         "questions": [
             "精神科医が最も処方する薬剤トップ10",
             "専門科別の平均オピオイド処方率が高い上位10（医師100人以上）",
             "都市部と地方の医師でジェネリック率を比較"]},
        {"key": "cost", "title": "お金の流れを見る",
         "lead": "薬剤費と、患者の自己負担が分かります",
         "questions": [
             "2024年、患者の自己負担額が大きい薬剤トップ10（ブランド名ごとに）",
             "低所得補助（LIS）向け請求の割合が高い州トップ10",
             "2024年のスタチンの総薬剤費は全国でいくら？"]},
    ],
    "en": [
        {"key": "trend", "title": "Follow trends over time",
         "lead": "Three years of data shows which drugs are rising and which are falling",
         "questions": [
             "How did national GLP-1 receptor agonist volume change from 2022 to 2024?",
             "Yearly trend in the number of DOAC prescribers, by drug",
             "How much did total drug spending grow from 2022 to 2024?"]},
        {"key": "geo", "title": "Compare across states",
         "lead": "50 states plus DC, shown on a choropleth map",
         "questions": [
             "States ranked by drug spending per beneficiary",
             "Top 10 states by opioid claims",
             "Compare GLP-1 receptor agonist prescriptions by state, 2022 vs 2024"]},
        {"key": "drug", "title": "Look up a drug",
         "lead": "Search by generic or brand name. A drug-class dictionary is built in",
         "questions": [
             "Top 10 drugs by total spending in 2024, by brand name",
             "How much did the number of Ozempic prescribers grow from 2022 to 2024?",
             "Top 10 drugs by claim count in 2024, aggregated by generic name"]},
        {"key": "prescriber", "title": "Look at the prescribers",
         "lead": "Specialty, location, and the demographics of their patient panel",
         "questions": [
             "Top 10 drugs most prescribed by psychiatrists",
             "Top 10 specialties by average opioid prescribing rate (100+ prescribers)",
             "Compare generic dispensing rate between urban and rural prescribers"]},
        {"key": "cost", "title": "Follow the money",
         "lead": "Drug spending, and what patients pay out of pocket",
         "questions": [
             "Top 10 drugs by patient out-of-pocket cost in 2024, by brand name",
             "Top 10 states by share of claims for low-income subsidy beneficiaries",
             "What was total statin spending nationally in 2024?"]},
    ],
}

# データの守備範囲。誤解を招かないよう「できないこと」も同じ重みで出す。
CAN_DO = {
    "ja": [
        "医師ひとり単位まで下りられる（NPI・氏名・所在地・専門科が公開されている）",
        "薬剤はブランド名と一般名の両方。薬効クラスの辞書を用意してある",
        "処方回数・30日換算の処方量・日数・総薬剤費・受給者数",
        "65歳以上の内訳、低所得補助の有無、患者集団の年齢・性別・人種・リスクスコア",
        "州・全国の集計は抑制前の全数なので、地域比較に向く",
    ],
    "en": [
        "Drill down to individual prescribers (NPI, name, location and specialty are public)",
        "Look up drugs by brand or generic name; a drug-class dictionary is built in",
        "Claim counts, 30-day standardized fills, day supply, total spending, beneficiary counts",
        "Age-65-and-over breakdowns, low-income subsidy status, and panel demographics",
        "State and national totals are pre-suppression, so they are well suited to comparison",
    ],
}

CANNOT_DO = {
    "ja": [
        "患者ひとりを追うことはできない（集計済みで、診断名も転帰も無い）",
        "処方の理由・適応は分からない。薬と件数だけ",
        "件数 1〜10 は抑制されて空欄。0 ではない",
        "Part D 加入者の外来処方のみ（Medicare 受給者の約8割）。入院と Part B 薬は含まない",
        "費用はリベート控除前。製薬企業からの割戻しは反映されていない",
    ],
    "en": [
        "You cannot follow an individual patient — the data is aggregated, with no diagnoses or outcomes",
        "There is no indication or reason for the prescription, only the drug and the counts",
        "Counts of 1-10 are suppressed and left blank. Blank is not zero",
        "Outpatient Part D fills only (about 80% of Medicare beneficiaries). No inpatient or Part B drugs",
        "Spending is before rebates. Manufacturer rebates are not reflected",
    ],
}

app = FastAPI(title="Medicare Part D × Text-to-SQL API", docs_url=None, redoc_url=None)

# ローカル開発では Next.js が :3000、API が :8000 で別オリジンになる。
# 本番は同一コンテナ内で Next.js が同一オリジンにプロキシするので不要。
if os.getenv("ALLOW_DEV_CORS") == "1":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# セッションごとの質問数。インスタンス内のメモリのみ（設計書 §4.5 の簡易カウンタ）。
_sessions: dict[str, tuple[RateLimit, float]] = {}
_agents: dict[str, Agent] = {}


def _rate_limit(session_id: str) -> RateLimit:
    now = time.time()
    for sid, (_, seen) in list(_sessions.items()):
        if now - seen > SESSION_TTL_SEC:
            _sessions.pop(sid, None)
    limit, _ = _sessions.get(session_id, (RateLimit(max_questions=MAX_QUESTIONS), now))
    _sessions[session_id] = (limit, now)
    return limit


def _agent(model_key: str) -> Agent:
    """モデルごとに1つ持ち回す（システムプロンプトの組み立てを毎回やらない）。"""
    model_id = MODELS.get(model_key, MODELS["sonnet"])["id"]
    if model_id not in _agents:
        _agents[model_id] = Agent(model=model_id)
    return _agents[model_id]


class HistoryTurn(BaseModel):
    """直前までのやり取り。会話を続けられるようにフロントから渡す。"""

    question: str = Field(max_length=500)
    sql: str = Field(default="", max_length=4000)
    answer: str = Field(default="", max_length=2000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    model: str = "sonnet"
    years: list[int] = []
    state: str | None = None
    specialty: str | None = None
    drug_class: str | None = Field(default=None, alias="drugClass")
    population: str | None = None
    area: str | None = None
    history: list[HistoryTurn] = Field(default_factory=list, max_length=4)
    lang: str = "ja"

    model_config = {"populate_by_name": True}


POPULATION_HINT = {
    "ge65": "65歳以上の内訳（ge65_* 列）だけを見る",
    "lis": "低所得補助（LIS）対象の内訳（lis_* 列）だけを見る",
    "dual": "Medicaid 二重加入者（bene_dual_cnt）に注目する",
}
AREA_HINT = {
    "urban": "都市部の医師のみ（provider.prscrbr_ruca を FLOAT64 にして 4 未満、'99' と NULL は除く）",
    "rural": "地方の医師のみ（provider.prscrbr_ruca を FLOAT64 にして 7 以上 11 未満、'99' と NULL は除く）",
}


def _decorate(req: AskRequest) -> str:
    """絞り込みを質問文に足す。"""
    hints = []
    if req.years:
        hints.append(f"対象年は {', '.join(str(y) for y in sorted(set(req.years)))} 年")
    if req.state:
        hints.append(f"対象は {req.state} 州のみ")
    if req.specialty:
        hints.append(f"専門科は prscrbr_type = '{req.specialty}' のみ")
    if req.drug_class:
        hints.append(f"薬剤は partd.drug_class の drug_class = '{req.drug_class}' に絞る")
    if req.population and req.population in POPULATION_HINT:
        hints.append(POPULATION_HINT[req.population])
    if req.area and req.area in AREA_HINT:
        hints.append(AREA_HINT[req.area])
    return f"{req.question}（{'／'.join(hints)}）" if hints else req.question


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"


def _lang(value: str | None) -> str:
    return "en" if (value or "").lower().startswith("en") else "ja"


def _models(lang: str) -> dict[str, dict[str, str]]:
    """モデル一覧。note だけ言語で差し替える（id と label は共通）。"""
    return {
        key: {"id": m["id"], "label": m["label"],
              "note": m["noteEn"] if lang == "en" else m["note"]}
        for key, m in MODELS.items()
    }


def _opts(rows: list[tuple[str, str, str]], lang: str) -> list[dict[str, str]]:
    return [{"value": v, "label": (en if lang == "en" else ja)} for v, ja, en in rows]


@app.get("/api/config")
def config(lang: str = "ja") -> dict[str, Any]:
    """フロントが起動時に読む設定。質問例やモデル一覧を二重管理しない。"""
    lang = _lang(lang)
    return {
        "lang": lang,
        "examples": EXAMPLES[lang],
        "models": _models(lang),
        "years": [2022, 2023, 2024],
        "specialties": _opts(SPECIALTIES, lang),
        "drugClasses": _opts(DRUG_CLASSES, lang),
        "states": _opts(STATES, lang),
        "populations": _opts(POPULATIONS, lang),
        "areas": _opts(AREAS, lang),
        "maxQuestions": MAX_QUESTIONS,
        "dataNote": {
            "period": "CY2022–2024",
            "suppression": ("Counts under 11 are suppressed" if lang == "en"
                            else "11件未満は抑制（空欄）"),
            "source": "data.cms.gov",
            "sourceUrl": (
                "https://data.cms.gov/provider-summary-by-type-of-service/"
                "medicare-part-d-prescribers"
            ),
        },
    }


_overview_cache: dict[str, Any] | None = None


@app.get("/api/overview")
def overview(lang: str = "ja") -> dict[str, Any]:
    """データの規模を実データから返す。初回だけ BigQuery を引いてキャッシュする。"""
    global _overview_cache
    lang = _lang(lang)
    if _overview_cache is None:
        _overview_cache = _load_overview()
    return {**_overview_cache,
            "lang": lang,
            "topics": TOPICS[lang],
            "canDo": CAN_DO[lang],
            "cannotDo": CANNOT_DO[lang]}


def _load_overview() -> dict[str, Any]:

    from app.tools import run_sql

    r = run_sql(
        """
        SELECT
          (SELECT COUNT(*) FROM partd.provider WHERE year = 2024) AS prescribers,
          (SELECT COUNT(DISTINCT prscrbr_type) FROM partd.provider WHERE year = 2024)
            AS specialties,
          (SELECT SUM(tot_clms) FROM partd.geo_drug
           WHERE year = 2024 AND prscrbr_geo_lvl = 'National') AS claims,
          (SELECT SUM(tot_drug_cst) FROM partd.geo_drug
           WHERE year = 2024 AND prscrbr_geo_lvl = 'National') AS cost,
          (SELECT COUNT(DISTINCT gnrc_name) FROM partd.geo_drug WHERE year = 2024)
            AS generics,
          (SELECT COUNT(DISTINCT brnd_name) FROM partd.geo_drug WHERE year = 2024)
            AS brands
        """,
        "画面の概要に出す規模の数字",
    )
    stats: dict[str, Any] = {}
    if "error" not in r and r["rows"]:
        stats = dict(zip(r["columns"], r["rows"][0]))

    return {
        "period": "CY2022–2024",
        "rows": 85_167_407,          # 3年 × 5テーブルの合計（3 表 85,167,141 ＋ seed 266。README の表の和）
        "stats": stats,
        "tables": [
            {"name": "provider_drug", "grainJa": "年 × 医師 × 薬剤",
             "grainEn": "year x prescriber x drug", "rows": 80_688_291},
            {"name": "provider", "grainJa": "年 × 医師（84列のサマリ）",
             "grainEn": "year x prescriber (84-column summary)", "rows": 4_129_857},
            {"name": "geo_drug", "grainJa": "年 × 地域 × 薬剤",
             "grainEn": "year x geography x drug", "rows": 348_993},
        ],
    }


@app.get("/api/session")
def session(response: Response, partd_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    sid = partd_session or uuid.uuid4().hex
    response.set_cookie(SESSION_COOKIE, sid, max_age=SESSION_TTL_SEC,
                        httponly=True, samesite="lax")
    limit = _rate_limit(sid)
    return {"remaining": limit.remaining, "maxQuestions": limit.max_questions}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/ask")
def ask(req: AskRequest, response: Response,
        partd_session: str | None = Cookie(default=None)) -> StreamingResponse:
    sid = partd_session or uuid.uuid4().hex
    limit = _rate_limit(sid)

    def stream() -> Iterator[str]:
        if limit.remaining == 0:
            yield _sse({
                "type": "error",
                "message": f"このセッションの質問数の上限（{limit.max_questions}問）に達しました。"
                           "しばらく時間をおいてからお試しください。",
                "remaining": 0,
            })
            return

        limit.consume()
        question = _decorate(req)
        log_event("ask", session=sid[:8], question=question, model=req.model,
                  remaining=limit.remaining)
        try:
            history = [h.model_dump() for h in req.history]
            for event in _agent(req.model).ask_stream(
                question, history=history, lang=_lang(req.lang)):
                if event["type"] == "done":
                    result = event["result"]
                    yield _sse({
                        "type": "done",
                        "elapsedSec": result.elapsed_sec,
                        "usage": result.usage,
                        "stoppedEarly": result.stopped_early,
                        "remaining": limit.remaining,
                    })
                else:
                    yield _sse(event)
        except Exception as e:                       # noqa: BLE001
            log_event("ask_failed", severity="ERROR", session=sid[:8],
                      error=type(e).__name__, message=str(e))
            yield _sse({"type": "error",
                        "message": "処理中にエラーが発生しました。もう一度お試しください。"})

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",           # プロキシにバッファさせない
        "Set-Cookie": (f"{SESSION_COOKIE}={sid}; Max-Age={SESSION_TTL_SEC}; "
                       "Path=/; HttpOnly; SameSite=Lax"),
    }
    return StreamingResponse(stream(), media_type="text/event-stream", headers=headers)
