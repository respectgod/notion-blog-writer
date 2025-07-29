// 📁 index.js
import { Client as NotionClient } from '@notionhq/client';
import { OpenAI } from 'openai';

const notion = new NotionClient({ auth: process.env.NOTION_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// 공통: rich_text, title, 등 안전하게 접근
function getPlainText(prop, type = 'rich_text') {
  try {
    return prop?.[type]?.[0]?.plain_text || '';
  } catch {
    return '';
  }
}

function getTitleText(prop) {
  return getPlainText(prop, 'title');
}

function getMultiSelectText(prop) {
  try {
    return prop?.multi_select?.map(item => item.name).join(', ') || '';
  } catch {
    return '';
  }
}

// ✅ Notion에서 작성되지 않은 행 가져오기
async function fetchNotionRows() {
  const response = await notion.databases.query({
    database_id: process.env.NOTION_DB_ID,
    filter: {
      property: '작성됨',
      checkbox: { equals: false },
    },
  });
  return response.results;
}

// ✅ GPT로 블로그 글 생성
async function generateBlogText(entry) {
  const props = entry.properties;

  if (!props['음식점 이름']?.title?.[0]?.plain_text) {
    console.warn('❗ 음식점 이름이 비어있어 생략됨');
    return '';
  }

  const restaurant = props['음식점 이름']?.title?.[0]?.plain_text || '음식점';

  const menu = getPlainText(props['메뉴']);
  const time = getPlainText(props['방문시간']);
  const location = getPlainText(props['지역']);
  const category = getPlainText(props['카테고리']);
  const open = getPlainText(props['영업시간']);
  const breakTime = getPlainText(props['브레이크타임']);
  const holiday = getPlainText(props['휴무정보']);
  const keyword = getMultiSelectText(props['필수키워드']);
  const mainKeyword = keyword.split(',')[0]?.trim() || restaurant;


  const prompt = `
넌 네이버 블로그 맛집 20년차의 전문 작가야 그리고 SEO 최적화를 잘 지키는 작가야.
검색을 할때는 구글 검색결과보다는 네이버 검색결과로 말해줘
메뉴는 그 음식점을 네이버에 검색해서, 가장 유명한 메뉴를 중심으로 맛과 모양을 써줘.
아래 조건에 맞춰서 네이버 블로그 포스팅을 작성해주는데, 규칙은 반드시 지켜야 하고 규칙을 지킬수 없다면 말해줘

[규칙]
1. 글은 2000자 정도 작성한다.
2. 내용에 맞는 타이틀과 서브타이틀을 한 문장으로 적는다.
3. ${mainKeyword}는 문맥에 잘 맞게 어색하지 않도록 글에 3회 이상 반복한다.
4. AI 티가 나지 않도록 자연스럽게 작성한다.
5. 말투는 친근한 존댓말로 "ㅇㅇ 했어요~" 아니면 "ㅇㅇ 입니다."로 쓴다.
6. 타이틀 예시 : [성수/스테이크] 데이트하기 딱 좋은 분위기 맛집 | 놉스
7. 서브타이틀 예시: “연인과 특별한 날을 보내기 좋은 스테이크집”
8. 위의 타이틀과 서브타이틀의 예시를 보고 사람들이 관심을 가질만한 키워드를 넣어서 타이틀과 서브타이틀 적어줘.
9. 글을 다 쓰고 나면 위의 규칙을 모두 지켰는지 다시 한번 스스로 점검한다.
10. 위의 규칙을 지키지 않았던 부분이 있다면 알맞게 수정한다.

[참고 형식]
타이틀은 6~8단어 정도로, 지역+카테고리+감정+핵심키워드가 모두 담기면 더 좋습니다.
[${location}/${category}] 타이틀 | ${restaurant}

내용은
타이틀 "${restaurant}"
서브타이틀


웨이팅 소요 시간
${time}
--
영업시간
평일 : ${open}
주말 : ${open}
브레이크타임 : ${breakTime}
휴무정보 : ${holiday}
--

"내부사진과 설명"
(좌석간 간격 어떤지)
"메뉴판과 설명"
(메뉴판 사진)
${menu}
(네이버 검색을 통해 유명한 메뉴에 대한 설명)
"테이블 세팅과 설명"
(기본반찬, 테이블 기본 세팅)
"음식"
(음식 사진과 맛 설명)

seo최적화 태그들
예시(참고용): #성수맛집 #놉스스테이크 #성수스테이크 #데이트맛집 #서울스테이크맛집
`;

console.log('🧾 전달된 프롬프트:', prompt);


  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: '넌 네이버 블로그 전문 작가야.' },
      { role: 'user', content: prompt },
    ],
  });

  return completion.choices?.[0]?.message?.content || '';
}

// ✅ Notion에 글 업데이트
async function updateNotion(entry, blogText) {
  // 작성됨 표시
  await notion.pages.update({
    page_id: entry.id,
    properties: {
      작성됨: { checkbox: true },
    },
  });

  // GPT 응답 길이 대응
  const MAX_BLOCK_SIZE = 1999;
  const blocks = [];

  for (let i = 0; i < blogText.length; i += MAX_BLOCK_SIZE) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: blogText.slice(i, i + MAX_BLOCK_SIZE) },
          },
        ],
      },
    });
  }

  await notion.blocks.children.append({
    block_id: entry.id,
    children: blocks,
  });
}

// ✅ 메인 실행 함수
export default async function run() {
  const rows = await fetchNotionRows();

  for (const row of rows) {
    const text = await generateBlogText(row);

    if (!text || text.trim() === '') {
      console.warn('🚫 생성된 글이 비어있어서 생략됨');
      continue;
    }

    await new Promise((res) => setTimeout(res, 1000)); // 1초 대기
    await updateNotion(row, text);

    const name = getTitleText(row.properties['음식점 이름']);
    console.log(`✅ ${row.properties['음식점 이름']?.title?.[0]?.plain_text || '???'} 작성 완료`);
    console.log('▶ row.properties["음식점 이름"]:', JSON.stringify(row.properties['음식점 이름'], null, 2));
  }
}

// ✅ 진입점
run().catch((err) => {
  console.error('🚨 오류 발생:', err.message);
});
