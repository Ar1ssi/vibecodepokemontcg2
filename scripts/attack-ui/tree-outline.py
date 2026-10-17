"""Print a dump-tree.py JSON as an indented hierarchy: name, RectTransform geometry, component types."""
import json, sys
def r(v): 
    if isinstance(v,dict) and set(v)>= {'x','y'}: return [round(v['x'],3),round(v['y'],3)]+([round(v['z'],3)] if 'z' in v else [])
    return v
def walk(n,d=0):
    t=next((c for c in n['components'] if c['type'] in('RectTransform','Transform')),{})
    others=[c['type'] for c in n['components'] if c['type'] not in('RectTransform','Transform')]
    geo=f"aMin{r(t.get('m_AnchorMin'))} aMax{r(t.get('m_AnchorMax'))} pos{r(t.get('m_AnchoredPosition'))} size{r(t.get('m_SizeDelta'))} piv{r(t.get('m_Pivot'))} lp{r(t.get('m_LocalPosition'))} sc{r(t.get('m_LocalScale'))}" if t.get('m_AnchorMin') else f"lp{r(t.get('m_LocalPosition'))} sc{r(t.get('m_LocalScale'))}"
    print('  '*d+('' if n['active'] else '[off] ')+n['name']+' | '+geo+' | '+','.join(others))
    for c in n['children']: walk(c,d+1)
walk(json.load(open(sys.argv[1],encoding='utf-8')))
