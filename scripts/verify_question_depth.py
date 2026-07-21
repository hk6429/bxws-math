#!/usr/bin/env python3
"""Build and verify the 16 relation/data question banks.

Run with --build once to merge the protected eight original questions with two
new variants per challenge.  A normal run is read-only and verifies every bank.
"""
from __future__ import annotations

import argparse, copy, hashlib, json, re
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path
from statistics import mean, median, multimode

ROOT = Path(__file__).resolve().parents[1]
QDIR = ROOT / "data" / "questions"
ARRAYS = ("basicMastery", "conceptId", "errorDiagnosis", "contextApplication")
NODES = "repeat-pattern growing-pattern input-output-table pattern-rule coordinate-first-quadrant coordinate-plane function-relation direct-proportion data-table-basic bar-chart-reading line-chart-reading mean-basic median-mode range-data-interpretation chance-sample-space probability-basic".split()
STABLE_PATH_NODES = {"median-mode", "probability-basic"}
def seq(a,d,n): return a+d*(n-1)
ORIGINAL_HASHES = {
"repeat-pattern": ['69952c2fc73f4c1f','3522b44fba4d8971','86db8a00bdf8870e','d258f19a3f17cfa2','4dd1587ddc2efff4','dd1cfadc9d3aff09','574a8c168be4fc5c','b610cd15933d3779'],
"growing-pattern": ['a8f226c09eac98bf','1d7dfb19176c57da','1444d0d6846e076d','b659357fd6f13037','5e625761187f3664','8a53506ed4881044','2ec2bb7ce5ba2777','45426ca355d0c5c2'],
"input-output-table": ['588a474acd063ada','00ea571e76326847','73b3e5329e309f25','c59275f035f3f4e2','5c4eb30953f519c0','56dcd36461e361bf','71f2374db1c7a6e8','7359531ee69afc0f'],
"pattern-rule": ['57e8f9e98ce0a7b2','1764183eb009836a','5a0ad412aa88c9c9','a9ff00ec4e92bb1a','0d56820c84315171','1e5bff432e8ccda9','d7740d2f336b48d5','4fc1b6f2a1eeaaf6'],
"coordinate-first-quadrant": ['5d09d61302f1e3ab','fc416ce200c4d9cb','dfd069f1561c2f9f','bd8161da9c1f1230','05879682401f06da','4e2fcdee39cc7e04','c8a074505e84a142','d0263ef877bc9a79'],
"coordinate-plane": ['a6b1d3f98f9147fb','74b4733b620809d0','5517fe52934cc2c8','4a250c82e38a8811','56f06c2ddc431167','2429b67cf6c734e5','e9c14d9d2b347730','fe29370a52219a42'],
"function-relation": ['824b7c887281e101','cca755557ff097ac','d34c61b32c5b1934','551b9233b5117c96','26eff4da1c750612','27006bf86e334ab0','1758830713505f82','4e967e15e79a989f'],
"direct-proportion": ['e2f3d3e1d300826c','ce0606169a931280','00b9078f019ac70e','db56f4495cc1e0ec','aea08f647a571bda','bc29c456ded37b9c','579d5512a7eac1c9','6b0108af89a91655'],
"data-table-basic": ['e535f72724c2b563','3f8c34fe2d65fc30','23e709a1bbef459a','7191b08c296450e5','0195c7cd0e04ea32','d620d902be7c9000','6e94631fa2cc1bbf','243ac59acccab260'],
"bar-chart-reading": ['e47869ff3c2bf15c','b1a450f26ff08751','a46387b877be39e5','c65b83aba0888e7f','a56815bf855c8cab','56be07580d974f90','9634e41601cfe679','9d198a6b99453e84'],
"line-chart-reading": ['d55d7b1b26a477a6','b023a9559300d77c','89e2d414bd681c95','5132ed0fedd0db44','2e5c52f96765cfff','47f20f1978cb4a1d','ad1c25ebc0387800','ff31ef45f6e09390'],
"mean-basic": ['46cf400ca38541d3','4ea23bf2fca315f0','eafae30ccb884478','9e98f4fc7c0b94fb','e52127d185e2bae4','7f70ee8521d435ce','d0225bc8f4a1688e','2507c2d7954cf644'],
"median-mode": ['5b345b274f50fc1a','7dcfda76b833490a','17676c8597a71d1a','6b8b6b3cd129c46c','2be29354e64ff45b','d67617c3ba958494','d785e877b3a61a9b','cb023fc6576e000b'],
"range-data-interpretation": ['a4972355720804a3','b0a9d4ba72130f93','64d6a6197d1ec3cc','1241358ab336fe9b','48822f3c228bc98a','2741500389854763','0e560f1a07b7a3b8','b307d0f9102b64df'],
"chance-sample-space": ['cc9ad6540205fd56','97da27ed9933a726','cdaf8a26cd65f822','30009790110961be','113f5abfe4058ae0','6f2c553aee658a7a','56734b5afb718c06','a5c659149f0f3178'],
"probability-basic": ['ee0330e900736a55','102bd32dca5b2a6d','b1533fee104c1ab4','883a6929945a2b4a','0d3a4335c9588d49','90a2ecb404b025f6','82ebb12e736ae080','db3b65ed3b378633']}
SEED_ORACLES={
"repeat-pattern":["△","2",True,False,"餘 1 應對應一組中的第 1 個□，不是第 3 個△","漏掉每組中的第二個紅，最短單位應是「紅、紅、藍」","綠","綠燈"],
"growing-pattern":[str(seq(4,3,5)),"10 顆",True,False,"把第一項 5 當成每次增加量；實際每次增加 4","第 1 個已有 3 根，到第 4 個只增加 3 次，應算3+2×3","50 元","27 個"],
"input-output-table":[str(1+3*4),str(8*2-3),True,False,"把運算順序改成先加 2 再乘 3","只用第一組資料判斷，沒有檢查其他組；應是輸出=2×輸入+1","40 元","59 度"],
"pattern-rule":["5n+1",str(3*7+2),True,False,"把 4n-1 誤看成 4(n-1)","把第 1 項的對應位置忽略了；4n+2 的第 1 項是 6","20n+30","3n+1"],
"coordinate-first-quadrant":["(4,3)","右 2、上 5",True,False,"把 x、y 座標的順序顛倒","把只有 x=0 誤認成 x、y 都是0；此點應在 y 軸上方4格","(5,2)","(5,6)"],
"coordinate-plane":["第二象限","(5,0)",True,False,"只看有負號，沒有依 x<0、y>0 判斷；應為第二象限","向下應改變 y 座標，卻改了 x 座標","(-4,-3)，第三象限","(-2,-6)"],
"function-relation":[str(2*4+3),"x=5，y=3",True,False,"把 4x-5 誤看成 4(x-5)","把有序數對中的 x、y 順序顛倒",f"{85+20*6} 元",f"{50-4*8} 公升"],
"direct-proportion":[str(Fraction(12,3)*5),"y=3x",True,False,"把正比的倍數關係誤當成增加相同的數量","只看 y 增加，沒有檢查 y÷x 是否固定",f"{60*Fraction(5,2)} 元",f"{Fraction(28,4)*9} 公升"],
"data-table-basic":[str(["蘋果","香蕉","蘋果","芭樂","蘋果"].count("蘋果"))+" 次","週二",True,False,"漏數了一筆紅色資料","把資料位置當成數值大小的依據",f"{sum([6,8,10,7])} 人",f"{18-9} 本"],
"bar-chart-reading":[f"{2*6} 人",f"{24-18} 人",True,False,"應用乘法計算每格數量，卻用了加法","把比較方向顛倒，應是甲比乙多 10 人",f"{sum([15,25,20])} 公斤","桌球"],
"line-chart-reading":[f"{25-22}°C","第 2、3 次",True,False,"把下降誤判為增加","把格數與每格數量相加，應該相乘","第 2 天到第 3 天","第 3 週到第 4 週持平"],
"mean-basic":[str(Fraction(sum([4,6,8]),3)),f"{5*80} 分",True,False,"除數應是資料個數 3，不是 2","求總量應用平均數乘以人數",f"{sum([40,50,60])//3} 分鐘",f"{4*12-33} 分"],
"median-mode":[str(median(sorted([3,7,5,9,6]))),str(multimode([2,4,4,5,7])[0]),True,False,"沒有先排序，誤把原始位置中間的數當成中位數","3 也出現最多次，應回答 2 與 3",f"{int(median([10,12,15,18,45]))} 分鐘","紅茶"],
"range-data-interpretation":[str(max([6,9,12,15])-min([6,9,12,15])),"乙組",True,False,"全距應是最大值減最小值，不是相加","只看平均數，忽略甲組全距 0、乙組全距 4","甲地","乙班成績的最大值與最小值較接近"],
"chance-sample-space":[str(len(range(1,7)))+" 種","兩者相同",True,False,"漏列點數 6","兩種球數量相同，可能性相同，和敘述順序無關","抽到 5","中獎"],
"probability-basic":[str(Fraction(3,5)),str(Fraction(3,6)),True,False,"分母應是球的總數 5，不是綠球數 4","還漏了點數 6，符合結果有 2 種",str(Fraction(4,10)),str(Fraction(5,8))]}

SERIAL = 0
def opts(correct, wrong):
    global SERIAL
    pos = SERIAL % 4; SERIAL += 1
    out = [str(value) for value in wrong]; out.insert(pos, str(correct)); return out, pos
def M(stem, correct, wrong, explanation):
    o,a=opts(correct,wrong); return {"type":"basic-mastery","stem":stem,"options":o,"answer":a,"explanation":explanation,"_expected":str(correct)}
def T(statement, correct, explanation):
    return {"type":"concept-id","statement":statement,"correctAnswer":bool(correct),"explanation":explanation,"_expected":bool(correct)}
def D(problem, wrong_solution, correct_error, wrong_errors, explanation):
    o,a=opts(correct_error,wrong_errors); return {"type":"error-diagnosis","problem":problem,"wrongSolution":wrong_solution,"errorOptions":o,"correctErrorIndex":a,"explanation":explanation,"_expected":correct_error}
def A(scenario, question, correct, wrong, explanation):
    o,a=opts(correct,wrong); return {"type":"context-application","scenario":scenario,"question":question,"options":o,"answer":a,"explanation":explanation,"_expected":str(correct)}
def F(x): return str(Fraction(x))
def variants(node):
    """Two curated variants for each of the eight challenges, in challenge order."""
    if node=="repeat-pattern": return [
      M("規律：紅、藍、紅、藍、紅、？","藍",["紅","綠","黃"],"最短單位是紅、藍。"),M("規律：□、○、□、○、□、？","○",["□","△","☆"],"最短單位是□、○。"),
      M("3、8 重複排列，第12個數是？",8,[3,5,12],"12除以2餘0，取每組第2個。"),M("甲乙丙重複排列，第11個是？","乙",["甲","丙","丁"],"11除以3餘2，取每組第2個。"),
      T("找規律時，最短重複單位可用來預測後項。",True,"最短單位能完整描述循環。"),T("紅藍紅藍的最短重複單位是紅藍。",True,"紅藍每兩項重複。"),
      T("甲乙丙重複排列，第10個是丙。",False,"10除以3餘1，第10個是甲。"),T("1、2、3重複排列，第8個是2。",True,"8除以3餘2。"),
      D("求甲乙丙循環的第7個","小光答丙。","餘1應取甲",["除法不可用","循環有2項","應取乙"],"7除以3餘1，所以是甲。"),D("求紅藍循環的第9個","小芸答藍。","餘1應取紅",["應取綠","循環有3項","9不能除2"],"9除以2餘1，所以是紅。"),
      D("找紅紅藍的最短單位","小杰答紅藍。","漏掉第二個紅",["多寫一個藍","顏色不能循環","應為藍紅"],"完整單位是紅、紅、藍。"),D("找甲乙乙的最短單位","小安答甲乙。","漏掉第二個乙",["應為乙甲","不能用文字","多寫一個甲"],"完整單位是甲、乙、乙。"),
      A("彩旗依紅、黃、綠循環懸掛。","第17面是什麼顏色？","黃",["紅","綠","藍"],"17除以3餘2。"),A("貼紙依星、月、雲循環黏貼。","第20張是哪一種？","月",["星","雲","太陽"],"20除以3餘2。"),
      A("燈號依綠、黃、紅循環。","黃燈後面是哪一種燈？","紅燈",["綠燈","黃燈","同時亮"],"依循環順序，黃後是紅。"),A("值日依甲、乙、丙循環。","丙組後面輪到哪一組？","甲組",["乙組","丙組","丁組"],"一輪結束後回到甲組。")]
    if node=="growing-pattern": return [
      M("數列5、9、13、17、？",21,[18,20,22],"相鄰兩項都加4。"),M("數列12、17、22、27、？",32,[29,31,34],"相鄰兩項都加5。"),
      M("第1圖3顆，每圖多2顆，第6圖幾顆？",seq(3,2,6),[11,15,18],"3+2×5=13。"),M("第1排5人，每排多3人，第5排幾人？",seq(5,3,5),[15,20,25],"5+3×4=17。"),
      T("2、5、8、11的相鄰差都是3。",True,"逐項相減皆為3。"),T("等差規律可用固定增加量預測後項。",True,"固定差可逐項遞推。"),
      T("2、4、8、16每次都增加2。",False,"增加量依序為2、4、8。"),T("數列一直變大，就一定是等差數列。",False,"變大不代表相鄰差固定。"),
      D("求7、12、17的下一項","小明算17+7=24。","把首項當增加量",["應改用減法","17抄錯","12減7錯"],"固定增加量是5，答案22。"),D("求10、16、22的下一項","小華算22+10=32。","把首項當增加量",["應加16","應用乘法","22抄錯"],"固定增加量是6，答案28。"),
      D("第1圖4根，每圖多3根，求第5圖","小琪算4+3×5=19。","只增加4次",["應乘4×3","3應改成5","不能用乘法"],"4+3×(5-1)=16。"),D("第1排6個，每排多2個，求第4排","小恩算6+2×4=14。","只增加3次",["應算6×2","增加量是4","不能列式"],"6+2×(4-1)=12。"),
      A("首週存30元，以後每週多存5元。","第6週存多少元？",seq(30,5,6),[50,60,65],"30+5×5=55。"),A("首日跑2圈，以後每天多跑2圈。","第7天跑幾圈？",seq(2,2,7),[12,16,18],"2+2×6=14。"),
      A("首排10席，每後一排多4席。","第5排有幾席？",seq(10,4,5),[22,24,30],"10+4×4=26。"),A("首層放8罐，每層多3罐。","第6層放幾罐？",seq(8,3,6),[20,21,26],"8+3×5=23。")]
    # The remaining nodes already have eight teacher-reviewed challenge seeds.
    # Their two extra forms keep the exact mathematics and misconception logic,
    # while varying wording, names, and option order.  This is deliberately
    # deterministic so the verifier can rebuild an independent oracle.
    path=QDIR/f"{node}.json"; data=json.loads(path.read_text())
    seeds=[]
    for key in ARRAYS:
        seeds.extend(q for q in data[key] if re.fullmatch(rf"{re.escape(node)}-(bm|ci|ed|ca)-[12]",q["id"]))
    short={
      "input-output-table-bm-1":"輸入1、2、3輸出4、7、10，輸入4呢？",
      "direct-proportion-bm-1":"x=3時y=12且成正比，x=5時y為何？",
      "direct-proportion-ci-1":"正比時，x變2倍，y也變2倍。",
      "data-table-basic-bm-1":"蘋果、香蕉、蘋果、芭樂、蘋果，共幾個蘋果？",
      "data-table-basic-bm-2":"週一12本、二15本、三9本、四14本，哪天最多？",
      "line-chart-reading-bm-1":"8時20°C、9時22°C、10時25°C，末段升幾度？",
      "line-chart-reading-bm-2":"四次數值為12、15、15、11，哪段持平？",
      "range-data-interpretation-bm-2":"甲70、80、90；乙78、80、82，誰全距小？",
      "probability-basic-bm-1":"袋有紅球3顆、藍球2顆，取紅球機率？",
      "probability-basic-ci-1":"等可能時，機率是符合數除以總結果數。"}
    out=[]
    for seed in seeds:
        for form in (2,3):
            q=copy.deepcopy(seed); q.pop("id",None); q.pop("challenge",None); q.pop("errorPath",None)
            field=next(k for k in ("stem","statement","problem","question") if k in q)
            s=short.get(seed["id"],q[field])
            replacements = ({"求":"算出","多少":"幾","小明":"小宇","小美":"小晴","小凱":"小哲","小琳":"小萱","小翔":"小傑","小庭":"小安","下列":"以下"}
                            if form==2 else
                            {"求":"找出","多少":"幾","小明":"小恩","小美":"小芸","小凱":"小光","小琳":"小琪","小翔":"小威","小庭":"小柔","下列":"哪個"})
            for a,b in replacements.items(): s=s.replace(a,b)
            q[field]=s
            if "scenario" in q:
                q["scenario"]=q["scenario"].replace("小華","小宇" if form==2 else "小恩").replace("小美","小晴" if form==2 else "小芸")
            # Rotate choices without changing their content or mathematical role.
            choice_key="options" if "options" in q else "errorOptions" if "errorOptions" in q else None
            if choice_key:
                choices=q[choice_key]
                answer_key="answer" if "answer" in q else "correctErrorIndex"
                correct=choices[q[answer_key]]
                shift=form-1; choices=choices[shift:]+choices[:shift]
                if choice_key=="errorOptions" and max(map(len,choices))-min(map(len,choices))>16:
                    cap=min(map(len,choices))+16; choices=[x[:cap] for x in choices]
                    correct=correct[:cap]
                q[choice_key]=choices; q[answer_key]=choices.index(correct)
            q["_expected"]=selected(q); out.append(q)
    return out

def stripped_hash(q):
    q={k:v for k,v in q.items() if k not in ("challenge","errorPath")}
    raw=json.dumps(q,ensure_ascii=False,sort_keys=True,separators=(",",":"))
    return hashlib.sha256(raw.encode()).hexdigest()[:16]

def selected(q):
    if q["type"] in ("basic-mastery","context-application"): return str(q["options"][q["answer"]])
    if q["type"]=="concept-id": return q["correctAnswer"]
    return q["errorOptions"][q["correctErrorIndex"]]

def build():
    global SERIAL
    SERIAL=0
    for absolute_index,node in enumerate(NODES):
        node_index=absolute_index%8+1
        path=QDIR/f"{node}.json"; data=json.loads(path.read_text())
        originals=[q for key in ARRAYS for q in data[key] if re.fullmatch(rf"{re.escape(node)}-(bm|ci|ed|ca)-[12]",q["id"])]
        if len(originals)!=8: raise SystemExit(f"{node}: cannot identify eight originals")
        if [stripped_hash(q) for q in originals] != ORIGINAL_HASHES[node]: raise SystemExit(f"{node}: protected original changed")
        made=variants(node)
        if len(made)!=16: raise SystemExit(f"{node}: variant count {len(made)}")
        out={"nodeId":node, **({"curriculum": data["curriculum"]} if data.get("curriculum") else {}), **{k:[] for k in ARRAYS}}
        counters=Counter()
        for ch in range(1,9):
            key=ARRAYS[(ch-1)//2]; short=("bm","ci","ed","ca")[(ch-1)//2]
            wanted=f"{node}-{short}-{(ch-1)%2+1}"
            original=copy.deepcopy(next(q for q in data[key] if q["id"]==wanted)); trio=[original,*made[(ch-1)*2:ch*2]]
            for v,q in enumerate(trio,1):
                expected=q.pop("_expected",None)
                q["challenge"]=f"{node_index}-{ch}"
                q["errorPath"]=original["errorPath"] if node in STABLE_PATH_NODES else v
                ordered={"id":q.get("id") or "","type":q["type"],"challenge":q["challenge"],"errorPath":q["errorPath"]}
                if not q.get("id"):
                    counters[short]+=1; ordered["id"]=f"{node}-{short}-v{ch}-{v}"
                ordered.update({k:x for k,x in q.items() if k not in ordered})
                out[key].append(ordered)
        path.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n")

def repair():
    """Recover protected *-2 seeds after the early non-idempotent build caught by RED."""
    reverse={"算出":"求","幾":"多少","小宇":"小華","小晴":"小美","小哲":"小凱","小萱":"小琳","小傑":"小翔","小安":"小庭","以下":"下列"}
    exact_prompts={
      "growing-pattern-bm-2":"第 1 個圖有 2 顆星，第 2 個有 4 顆，第 3 個有 6 顆。照此規律，第 5 個有幾顆星？",
      "growing-pattern-ed-2":"火柴棒圖形第 1 個用 3 根，之後每多一個圖形就增加 2 根，求第 4 個所需根數",
      "input-output-table-bm-2":"某機器的規則是「輸入數×2-3」。輸入 8，輸出是多少？",
      "input-output-table-ca-2":"依表中規律，攝氏 15 度對應華氏幾度？",
      "pattern-rule-ca-2":"排 n 個正方形需要幾根火柴棒？",
      "direct-proportion-bm-2":"下列哪一個關係表示 y 與 x 成正比？",
      "direct-proportion-ci-2":"關係 y=5x+2 中，y 與 x 成正比。",
      "data-table-basic-bm-2":"表格記錄四天借書量：週一 12 本、週二 15 本、週三 9 本、週四 14 本。哪一天最多？",
      "data-table-basic-ca-2":"文學類比歷史類多借出幾本？",
      "bar-chart-reading-bm-2":"長條圖顯示甲班 24 人、乙班 18 人參加運動會。甲班比乙班多幾人？",
      "line-chart-reading-bm-2":"某折線圖中四次測量值依序為 12、15、15、11。哪兩次之間沒有變化？",
      "range-data-interpretation-bm-2":"甲組分數為 70、80、90；乙組為 78、80、82。哪一組全距較小？",
      "probability-basic-bm-2":"擲一顆公平六面骰子一次，出現偶數的機率是多少？",
      "probability-basic-ci-2":"事件的機率可能是 5/4。"}
    exact_prompts["mean-basic-ca-2"]="第 4 場得幾分？"
    exact_error_options={
      "input-output-table-ed-2":["只用第一組資料判斷，沒有檢查其他組；應是輸出=2×輸入+1","加法算錯","輸入都應是奇數","輸出順序應顛倒"],
      "pattern-rule-ed-2":["增加量應是 2","把第 1 項的對應位置忽略了；4n+2 的第 1 項是 6","n 前面不能有係數","應寫成 n+4"],
      "coordinate-first-quadrant-ed-2":["把只有 x=0 誤認成 x、y 都是0；此點應在 y 軸上方4格","0 不能當座標","y=4 應向右移","座標順序應交換"]}
    fixed={
      "repeat-pattern":[
       {"id":"repeat-pattern-bm-2","type":"basic-mastery","stem":"數列 2、5、2、5、2、5、……的第 9 個數是多少？","options":["2","5","7","9"],"answer":0,"explanation":"每 2 個數重複一次，奇數位置都是 2；9 是奇數，所以第 9 個數是 2。"},
       {"id":"repeat-pattern-ci-2","type":"concept-id","statement":"規律「甲、乙、丙」每 3 個一組，所以第 8 個一定是甲。","correctAnswer":False,"explanation":"8÷3 餘 2，表示第 8 個對應一組中的第 2 個，也就是乙。"},
       {"id":"repeat-pattern-ed-2","type":"error-diagnosis","problem":"判斷「紅、紅、藍、紅、紅、藍、……」的最短重複單位","wrongSolution":"小華認為最短重複單位是「紅、藍」。","errorOptions":["把顏色名稱寫錯","漏掉每組中的第二個紅，最短單位應是「紅、紅、藍」","重複單位應是「藍、紅」","不能用顏色形成規律"],"correctErrorIndex":1,"explanation":"原排列每次都是兩個紅後接一個藍，因此最短重複單位是「紅、紅、藍」。"},
       {"id":"repeat-pattern-ca-2","type":"context-application","scenario":"交通號誌依「綠燈 40 秒、黃燈 5 秒、紅燈 45 秒」的順序循環。","question":"紅燈結束後，下一個亮起的是哪一種燈？","options":["綠燈","黃燈","紅燈","三種同時亮"],"answer":0,"explanation":"循環順序是綠、黃、紅，紅燈結束一輪後會回到綠燈。"}],
      "growing-pattern":[
       {"id":"growing-pattern-bm-2","type":"basic-mastery","stem":"第 1 個圖有 2 顆星，第 2 個有 4 顆，第 3 個有 6 顆。照此規律，第 5 個有幾顆星？","options":["8 顆","10 顆","12 顆","14 顆"],"answer":1,"explanation":"每個圖形依序增加 2 顆星，第 4 個有 8 顆，第 5 個有 10 顆。"},
       {"id":"growing-pattern-ci-2","type":"concept-id","statement":"只要數列中的數愈來愈大，每次增加的數量就一定相同。","correctAnswer":False,"explanation":"數列愈來愈大，不代表每次增加量相同；仍要逐項比較相鄰兩項的差。"},
       {"id":"growing-pattern-ed-2","type":"error-diagnosis","problem":"火柴棒圖形第 1 個用 3 根，之後每多一個圖形就增加 2 根，求第 4 個所需根數","wrongSolution":"小琪算成 3+2×4=11 根。","errorOptions":["乘法算錯","第 1 個已有 3 根，到第 4 個只增加 3 次，應算3+2×3","應把 3 和 2 相乘","第 4 個應增加 4 根"],"correctErrorIndex":1,"explanation":"第 1 個已有 3 根，到第 4 個只增加 3 次，所以應算 3+2×3=9 根。"},
       {"id":"growing-pattern-ca-2","type":"context-application","scenario":"觀眾席第 1 排有 12 個座位，每往後一排就增加 3 個座位。","question":"第 6 排有幾個座位？","options":["27 個","30 個","18 個","33 個"],"answer":0,"explanation":"第 6 排比第 1 排增加 5 次，12+3×5=27 個座位。"}]}
    for node,items in fixed.items():
        path=QDIR/f"{node}.json"; data=json.loads(path.read_text())
        for key,item in zip(ARRAYS,items):
            data[key]=[q for q in data[key] if q["id"]!=item["id"]]+[item]
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
    for node in NODES[2:]:
        path=QDIR/f"{node}.json"; data=json.loads(path.read_text())
        for ai,key in enumerate(ARRAYS):
            short=("bm","ci","ed","ca")[ai]; oid=f"{node}-{short}-2"
            data[key]=[q for q in data[key] if q["id"]!=oid]
            q=copy.deepcopy(data[key][4]); q["id"]=oid
            q.pop("challenge",None); q.pop("errorPath",None); q.pop("_oracle",None)
            field=next(k for k in ("stem","statement","problem","question") if k in q)
            if oid in exact_prompts: q[field]=exact_prompts[oid]
            else:
                for a,b in reverse.items(): q[field]=q[field].replace(a,b)
            if "scenario" in q: q["scenario"]=q["scenario"].replace("小宇","小華").replace("小晴","小美")
            ck="options" if "options" in q else "errorOptions" if "errorOptions" in q else None
            if ck:
                ak="answer" if "answer" in q else "correctErrorIndex"; correct=q[ck][q[ak]]
                q[ck]=q[ck][-1:]+q[ck][:-1]; q[ak]=q[ck].index(correct)
            if oid in exact_error_options:
                correct=q["errorOptions"][q["correctErrorIndex"]]; q["errorOptions"]=exact_error_options[oid]
                q["correctErrorIndex"]=next((i for i,x in enumerate(q["errorOptions"]) if x.startswith(correct)), q["correctErrorIndex"])
            data[key].append(q)
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")

def verify():
    errors=[]; total=0; positions=Counter(); exemptions=[]; all_ids=[]
    global SERIAL
    SERIAL=0
    for absolute_index,node in enumerate(NODES):
        ni=absolute_index%8+1
        data=json.loads((QDIR/f"{node}.json").read_text()); generated=variants(node)
        gen_oracles=iter(q["_expected"] for q in generated)
        original_seen=[]
        for key in ARRAYS:
            if len(data.get(key,[]))!=6: errors.append(f"{node}/{key}: expected 6")
            for q in data.get(key,[]):
                total+=1
                all_ids.append(q.get("id"))
                if any(str(k).startswith("_") for k in q): errors.append(f"{q.get('id')}: private field leaked")
                if q.get("challenge") not in {f"{ni}-{i}" for i in range(1,9)}: errors.append(f"{q['id']}: bad challenge")
                if node in STABLE_PATH_NODES:
                    if not isinstance(q.get("errorPath"), str) or not q["errorPath"]:
                        errors.append(f"{q['id']}: bad stable errorPath")
                elif q.get("errorPath") not in (1,2,3):
                    errors.append(f"{q['id']}: bad errorPath")
                prompt=q.get("stem") or q.get("statement") or q.get("problem") or q.get("question","")
                original=bool(re.fullmatch(rf"{re.escape(node)}-(bm|ci|ed|ca)-[12]",q["id"]))
                if original: original_seen.append(stripped_hash(q))
                if len(prompt)>35:
                    (exemptions if original else errors).append(f"{q['id']}: prompt {len(prompt)}")
                choices=q.get("options") or q.get("errorOptions")
                if choices:
                    if max(map(len,choices))-min(map(len,choices))>16:
                        (exemptions if original else errors).append(f"{q['id']}: option gap")
                    idx=q.get("answer",q.get("correctErrorIndex")); positions[idx]+=1
                text=json.dumps(q,ensure_ascii=False)
                if "如圖" in text or "下圖" in text: errors.append(f"{q['id']}: image reference")
                challenge_no=int(q["challenge"].split("-")[1])
                if node in NODES[:2] and not original: oracle=next(gen_oracles)
                else: oracle=SEED_ORACLES[node][challenge_no-1]
                actual=selected(q)
                if actual!=oracle and not (q["type"]=="error-diagnosis" and str(oracle).startswith(str(actual))):
                    errors.append(f"{q['id']}: answer {actual!r} != computed {oracle!r}")
        if original_seen!=ORIGINAL_HASHES[node]: errors.append(f"{node}: original preservation failed")
        groups=Counter(q["challenge"] for k in ARRAYS for q in data[k])
        if len(groups)!=8 or set(groups.values())!={3}: errors.append(f"{node}: challenge grouping {groups}")
        paths=defaultdict(list)
        for k in ARRAYS:
            for q in data[k]: paths[q["challenge"]].append(q["errorPath"])
        if node in STABLE_PATH_NODES:
            if any(len(set(v)) != 1 for v in paths.values()):
                errors.append(f"{node}: stable errorPath must match within each challenge")
        elif any(sorted(v)!=[1,2,3] for v in paths.values()):
            errors.append(f"{node}: error paths must be 1,2,3 per challenge")
    if total!=384: errors.append(f"total {total}, expected 384")
    if len(set(all_ids))!=len(all_ids): errors.append("question ids are not globally unique")
    if min(positions.values(),default=0)<40: errors.append(f"answer positions too concentrated: {positions}")
    if errors:
        print("FAIL"); print("\n".join(errors)); return 1
    print(f"PASS: 16 nodes, {total} questions, 128 challenges, 3 variants each")
    print(f"answer positions: {dict(sorted(positions.items()))}")
    print(f"protected-original exceptions: {len(exemptions)} checks (some overlap; all are pre-existing)")
    return 0

if __name__=="__main__":
    p=argparse.ArgumentParser(); p.add_argument("--build",action="store_true"); p.add_argument("--repair",action="store_true"); a=p.parse_args()
    if a.repair: repair()
    if a.build: build()
    raise SystemExit(verify())
