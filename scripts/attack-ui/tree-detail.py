"""Print the Image, TextMeshPro and layout fields of a dump-tree.py JSON, one line per component (pass a 2nd arg for every component)."""
import json,sys
TMP_KEYS=['m_text','m_fontAsset','m_fontSharedMaterial','m_fontColor','m_fontSize','m_fontSizeMin','m_fontSizeMax','m_enableAutoSizing','m_fontStyle','m_HorizontalAlignment','m_VerticalAlignment','m_characterSpacing','m_lineSpacing','m_margin','m_enableWordWrapping','m_TextWrappingMode','m_overflowMode','m_isRichText','m_fontWeight']
IMG_KEYS=['m_Sprite','m_Color','m_Type','m_PixelsPerUnitMultiplier','m_FillCenter','m_PreserveAspect','m_Material','m_Texture','m_UVRect']
def col(c): 
    if isinstance(c,dict) and 'r' in c: return '#%02x%02x%02x/%.2f'%(round(c['r']*255),round(c['g']*255),round(c['b']*255),c['a'])
    if isinstance(c,dict) and 'rgba' in c:
        v=c['rgba']; return '#%02x%02x%02x/%.2f'%(v&255,(v>>8)&255,(v>>16)&255,((v>>24)&255)/255)
    return c
def walk(n,path=''):
    p=path+'/'+n['name']
    for c in n['components']:
        t=c['type']
        if t in('Image','RawImage'):
            print(p,t,{k:col(c.get(k)) for k in IMG_KEYS if k in c})
        elif t=='TextMeshProUGUI':
            print(p,t,{k:col(c.get(k)) for k in TMP_KEYS if k in c})
        elif t in ('HorizontalLayoutGroup','VerticalLayoutGroup','LayoutElement','ContentSizeFitter','AspectRatioFitter'):
            print(p,t,{k:v for k,v in c.items() if k not in('type','m_Enabled','m_Name')})
        elif t not in('RectTransform','Transform','CanvasRenderer') and len(sys.argv)>2:
            print(p,t,json.dumps({k:v for k,v in c.items() if k not in('type','m_Name','m_Enabled')},ensure_ascii=False)[:900])
    for ch in n['children']: walk(ch,p)
walk(json.load(open(sys.argv[1],encoding='utf-8')))
