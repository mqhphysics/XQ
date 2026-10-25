import emoji0 from '../../assets/emoji/1f600.svg'
import emoji1 from '../../assets/emoji/1f604.svg'
import emoji2 from '../../assets/emoji/1f606.svg'
import emoji3 from '../../assets/emoji/1f602.svg'
import emoji4 from '../../assets/emoji/1f923.svg'
import emoji5 from '../../assets/emoji/1f609.svg'
import emoji6 from '../../assets/emoji/1f60e.svg'
import emoji7 from '../../assets/emoji/1f60d.svg'
import emoji8 from '../../assets/emoji/1f970.svg'
import emoji9 from '../../assets/emoji/1f929.svg'
import emoji10 from '../../assets/emoji/1f914.svg'
import emoji11 from '../../assets/emoji/1f928.svg'
import emoji12 from '../../assets/emoji/1f62d.svg'
import emoji13 from '../../assets/emoji/1f605.svg'
import emoji14 from '../../assets/emoji/1f62e.svg'
import emoji15 from '../../assets/emoji/1f631.svg'
import emoji16 from '../../assets/emoji/1f621.svg'
import emoji17 from '../../assets/emoji/1f624.svg'
import emoji18 from '../../assets/emoji/1f644.svg'
import emoji19 from '../../assets/emoji/1f62c.svg'
import emoji20 from '../../assets/emoji/1f973.svg'
import emoji21 from '../../assets/emoji/1f634.svg'
import emoji22 from '../../assets/emoji/1f607.svg'
import emoji23 from '../../assets/emoji/1f60f.svg'
import emoji24 from '../../assets/emoji/26bd.svg'
import emoji25 from '../../assets/emoji/1f945.svg'
import emoji26 from '../../assets/emoji/1f3c6.svg'
import emoji27 from '../../assets/emoji/1f947.svg'
import emoji28 from '../../assets/emoji/1f3df.svg'
import emoji29 from '../../assets/emoji/1f525.svg'
import emoji30 from '../../assets/emoji/1f4aa.svg'
import emoji31 from '../../assets/emoji/1f44f.svg'
import emoji32 from '../../assets/emoji/1f44d.svg'
import emoji33 from '../../assets/emoji/1f64c.svg'
import emoji34 from '../../assets/emoji/1f91d.svg'
import emoji35 from '../../assets/emoji/1f389.svg'
import emoji36 from '../../assets/emoji/1f6a9.svg'
import emoji37 from '../../assets/emoji/1f7e8.svg'
import emoji38 from '../../assets/emoji/1f7e5.svg'
import emoji39 from '../../assets/emoji/1f3af.svg'

export const emojiGroups = [
  {
    id: 'football',
    label: '足球',
    items: [
      { value: '⚽', name: '足球', source: emoji24 },
      { value: '🥅', name: '球门', source: emoji25 },
      { value: '🏆', name: '冠军', source: emoji26 },
      { value: '🥇', name: '金牌', source: emoji27 },
      { value: '🏟️', name: '球场', source: emoji28 },
      { value: '🔥', name: '火力全开', source: emoji29 },
      { value: '💪', name: '加油', source: emoji30 },
      { value: '👏', name: '好球', source: emoji31 },
      { value: '👍', name: '点赞', source: emoji32 },
      { value: '🙌', name: '欢呼', source: emoji33 },
      { value: '🤝', name: '握手', source: emoji34 },
      { value: '🎉', name: '庆祝', source: emoji35 },
      { value: '🚩', name: '角旗', source: emoji36 },
      { value: '🟨', name: '黄牌', source: emoji37 },
      { value: '🟥', name: '红牌', source: emoji38 },
      { value: '🎯', name: '命中', source: emoji39 },
    ],
  },
  {
    id: 'faces',
    label: '黄豆',
    items: [
      { value: '😀', name: '开心', source: emoji0 },
      { value: '😄', name: '大笑', source: emoji1 },
      { value: '😆', name: '笑开了', source: emoji2 },
      { value: '😂', name: '笑哭', source: emoji3 },
      { value: '🤣', name: '笑倒', source: emoji4 },
      { value: '😉', name: '眨眼', source: emoji5 },
      { value: '😎', name: '帅气', source: emoji6 },
      { value: '😍', name: '喜欢', source: emoji7 },
      { value: '🥰', name: '爱了', source: emoji8 },
      { value: '🤩', name: '太精彩', source: emoji9 },
      { value: '🤔', name: '思考', source: emoji10 },
      { value: '🤨', name: '疑惑', source: emoji11 },
      { value: '😭', name: '大哭', source: emoji12 },
      { value: '😅', name: '尴尬', source: emoji13 },
      { value: '😮', name: '惊讶', source: emoji14 },
      { value: '😱', name: '震惊', source: emoji15 },
      { value: '😡', name: '生气', source: emoji16 },
      { value: '😤', name: '不服', source: emoji17 },
      { value: '🙄', name: '白眼', source: emoji18 },
      { value: '😬', name: '紧张', source: emoji19 },
      { value: '🥳', name: '庆祝', source: emoji20 },
      { value: '😴', name: '困了', source: emoji21 },
      { value: '😇', name: '天使', source: emoji22 },
      { value: '😏', name: '得意', source: emoji23 },
    ],
  },
] as const

export const emojiByValue = new Map<string, { value: string; name: string; source: string }>(
  emojiGroups.flatMap((group) => group.items.map((item) => [item.value, item] as const)),
)
export const emojiPattern = new RegExp(
  [...emojiByValue.keys()].sort((a, b) => b.length - a.length).join('|'),
  'gu',
)
