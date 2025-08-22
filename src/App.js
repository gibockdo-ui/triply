import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Calendar, Music, Youtube, Loader, Wand2, X, Sparkles, Wind, Sun, Snowflake, Check, Image as ImageIcon, Share2, PlusCircle, Copy } from 'lucide-react';

// AI 모델에 전송할 JSON 응답 형식 정의
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    playlistTitle: { type: "STRING" },
    playlistDescription: { type: "STRING" },
    coverImagePrompt: { type: "STRING" },
    songs: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          artist: { type: "STRING" },
          reason: { type: "STRING" }
        },
        required: ["title", "artist", "reason"]
      }
    }
  },
  required: ["playlistTitle", "playlistDescription", "coverImagePrompt", "songs"]
};

// 선택 가능한 활동 및 장르 목록
const ACTIVITIES = [
  { id: 'relax', name: '휴식' }, { id: 'food', name: '맛집 탐방' },
  { id: 'activity', name: '액티비티' }, { id: 'shopping', name: '쇼핑' },
  { id: 'nature', name: '자연 감상' }, { id: 'city', name: '도시 탐험' },
  { id: 'party', name: '파티' }, { id: 'culture', name: '문화/예술' },
];
const GENRES = [
  { id: 'kpop', name: 'K-Pop' }, { id: 'pop', name: '팝' },
  { id: 'hiphop', name: '힙합/랩' }, { id: 'rnb', name: 'R&B/소울' },
  { id: 'rock', name: '록/메탈' }, { id: 'jazz', name: '재즈' },
  { id: 'classic', name: '클래식' }, { id: 'lofi', name: 'Lo-fi' },
];

// 메인 앱 컴포넌트
export default function App() {
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedActivities, setSelectedActivities] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [playlist, setPlaylist] = useState(null);
  const [coverImageUrl, setCoverImageUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');
  const destinationInputRef = useRef(null);

  // 도시 이름 자동 완성 API 호출
  useEffect(() => {
    if (destination.trim().length < 2) {
      setSuggestions([]); setShowSuggestions(false); return;
    }
    const debounceTimer = setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=5&accept-language=ko`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const cityNames = data.map(place => place.display_name) || [];
        setSuggestions(cityNames);
        setShowSuggestions(cityNames.length > 0);
      } catch (error) {
        console.error("Failed to fetch city suggestions:", error);
        setSuggestions([]); setShowSuggestions(false);
      }
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [destination]);

  const handleToggle = (id, list, setList) => {
    setList(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const generateCoverImage = async (prompt) => {
    setIsGeneratingImage(true); setCoverImageUrl(null);
    for (let attempts = 0; attempts < 3; attempts++) {
      try {
        const payload = { instances: [{ prompt }], parameters: { "sampleCount": 1 } };
        const apiKey = "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (result.predictions?.[0]?.bytesBase64Encoded) {
          setCoverImageUrl(`data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`);
          setIsGeneratingImage(false); return;
        } else { throw new Error("Image data not found in response."); }
      } catch (err) {
        if (attempts >= 2) {
          console.error("Error generating image:", err); setError('커버 이미지 생성에 실패했습니다.');
          setIsGeneratingImage(false); return;
        }
        await new Promise(res => setTimeout(res, Math.pow(2, attempts) * 100));
      }
    }
  };

  const generatePlaylist = async () => {
    if (!destination.trim() || !startDate || !endDate || selectedActivities.length === 0) {
      setError('모든 필드를 입력해주세요.'); return;
    }
    setIsLoading(true); setError(null); setPlaylist(null); setCoverImageUrl(null); setShowSuggestions(false);

    const prompt = `
      여행지: ${destination}
      여행 기간: ${startDate} 부터 ${endDate} 까지 (계절감 반영)
      주요 활동: ${selectedActivities.map(id => ACTIVITIES.find(a => a.id === id).name).join(', ')}
      선호 장르: ${selectedGenres.length > 0 ? selectedGenres.map(id => GENRES.find(g => g.id === id).name).join(', ') : '다양하게 추천'}
      
      위 정보를 바탕으로, 여행에 어울리는 음악 플레이리스트 10곡을 추천해줘.
      
      **다음의 모든 텍스트 설명은 반드시 한국어로 작성해줘:**
      1.  **플레이리스트 제목 (playlistTitle)**
      2.  **플레이리스트 간단한 설명 (playlistDescription)**
      3.  **각 곡의 추천 이유 (reason)**

      분위기에 맞는 커버 이미지 생성용 **영문 프롬프트('coverImagePrompt')**도 만들어줘.
      예시(일본 시티팝): '80s Japanese city pop album art, Hiroshi Nagai style, a coastal road at sunset, palm trees, pastel colors, nostalgic.'
      
      반드시 지정된 JSON 형식으로 응답해야 해.
    `;

    for (let attempts = 0; attempts < 5; attempts++) {
      try {
        const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA } };
        const apiKey = "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (result.candidates?.[0]) {
          const parsedPlaylist = JSON.parse(result.candidates[0].content.parts[0].text);
          setPlaylist(parsedPlaylist);
          setIsLoading(false);
          if (parsedPlaylist.coverImagePrompt) await generateCoverImage(parsedPlaylist.coverImagePrompt);
          return;
        } else { throw new Error("API로부터 유효한 응답을 받지 못했습니다."); }
      } catch (err) {
        if (attempts >= 4) {
          console.error("Error generating playlist:", err); setError('플레이리스트 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
          setIsLoading(false); return;
        }
        await new Promise(res => setTimeout(res, Math.pow(2, attempts) * 100));
      }
    }
  };

  const handleShare = () => {
    if (!playlist) return;
    const shareText = `🎵 트립플리 추천 플레이리스트 🎵\n\n"${playlist.playlistTitle}"\n${playlist.playlistDescription}\n\n${playlist.songs.map((song, i) => `${i + 1}. ${song.artist} - ${song.title}`).join('\n')}\n\n트립플리에서 나만의 여행 플리 만들기!`;
    navigator.clipboard.writeText(shareText).then(() => {
      setCopySuccess('플레이리스트가 복사되었어요!');
      setTimeout(() => setCopySuccess(''), 2000);
    });
  };

  const handleAddToYouTubeMusic = () => {
    if (!playlist) return;
    const searchQuery = playlist.songs.map(song => `${song.artist} ${song.title}`).join(', ');
    const url = `https://music.youtube.com/search?q=${encodeURIComponent(searchQuery)}`;
    window.open(url, '_blank');
  };

  const handleReset = () => {
    setDestination(''); setStartDate(''); setEndDate(''); setSelectedActivities([]); setSelectedGenres([]);
    setPlaylist(null); setCoverImageUrl(null); setError(null);
  };

  return (
    <>
      <style>{`
        @keyframes aurora {
          from { background-position: 50% 50%, 50% 50%; }
          to { background-position: 350% 50%, 350% 50%; }
        }
        .aurora-bg {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background-image: radial-gradient(ellipse 50% 80% at 20% 40%, rgba(147, 51, 234, 0.3), transparent),
                            radial-gradient(ellipse 50% 80% at 80% 50%, rgba(79, 70, 229, 0.3), transparent);
          background-size: 150% 150%;
          background-position: 0% 0%;
          animation: aurora 6s infinite linear;
          z-index: 0;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
        @keyframes fade-in-fast {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in-fast { animation: fade-in-fast 0.3s ease-out forwards; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.8); }
      `}</style>
      <div className="antialiased bg-slate-900 text-slate-200 font-sans min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
          <div className="absolute inset-0 z-0">
              <div className="aurora-bg"></div>
          </div>
        <div className="w-full max-w-4xl bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl shadow-purple-500/10 overflow-hidden z-10">
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-700 pb-5 mb-6">
              <div className="flex items-center gap-3">
                <Music className="w-8 h-8 text-purple-400 animate-pulse" />
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight bg-gradient-to-r from-purple-400 to-indigo-400 text-transparent bg-clip-text">트립플리 (Triply)</h1>
              </div>
              {playlist && (<button onClick={handleReset} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-purple-500/20"><X className="w-4 h-4" /> 새로 만들기</button>)}
            </div>

            {!playlist && !isLoading && (
              <div className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="relative" ref={destinationInputRef}>
                    <label htmlFor="destination" className="flex items-center gap-2 text-lg font-semibold mb-2 text-slate-300"><MapPin className="w-5 h-5 text-purple-400" /> 여행지</label>
                    <input id="destination" type="text" value={destination} onChange={(e) => setDestination(e.target.value)} onFocus={() => setShowSuggestions(suggestions.length > 0)} placeholder="도시 이름 입력 시작..." autoComplete="off" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all" />
                    {showSuggestions && suggestions.length > 0 && (
                      <ul className="absolute z-10 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg animate-fade-in-fast">
                        {suggestions.map((s, i) => (<li key={i} className="px-4 py-2 text-white hover:bg-slate-700 cursor-pointer" onMouseDown={() => { setDestination(s); setShowSuggestions(false); }}>{s}</li>))}
                      </ul>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label htmlFor="startDate" className="flex items-center gap-2 text-lg font-semibold mb-2 text-slate-300"><Calendar className="w-5 h-5 text-purple-400" /> 시작일</label><input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all" /></div>
                    <div><label htmlFor="endDate" className="flex items-center gap-2 text-lg font-semibold mb-2 text-slate-300"><Calendar className="w-5 h-5" /> 종료일</label><input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all" /></div>
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-lg font-semibold mb-3 text-slate-300"><Sparkles className="w-5 h-5 text-purple-400" /> 주요 활동</label>
                  <div className="flex flex-wrap gap-3">{ACTIVITIES.map(a => (<button key={a.id} onClick={() => handleToggle(a.id, selectedActivities, setSelectedActivities)} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200 ${selectedActivities.includes(a.id) ? 'bg-purple-500 border-purple-400 text-white shadow-lg shadow-purple-500/30' : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-purple-500'}`}>{a.name} {selectedActivities.includes(a.id) && <Check className="w-4 h-4" />}</button>))}</div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-lg font-semibold mb-3 text-slate-300"><Music className="w-5 h-5 text-purple-400" /> 선호 장르 (선택)</label>
                  <div className="flex flex-wrap gap-3">{GENRES.map(g => (<button key={g.id} onClick={() => handleToggle(g.id, selectedGenres, setSelectedGenres)} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200 ${selectedGenres.includes(g.id) ? 'bg-purple-500 border-purple-400 text-white shadow-lg shadow-purple-500/30' : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-purple-500'}`}>{g.name} {selectedGenres.includes(g.id) && <Check className="w-4 h-4" />}</button>))}</div>
                </div>
                {error && <p className="text-red-400 text-center pt-2 animate-fade-in-fast">{error}</p>}
                <div className="pt-4"><button onClick={generatePlaylist} disabled={isLoading} className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-4 px-6 rounded-lg text-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transform hover:scale-105"><Wand2 className="w-6 h-6" /> {isLoading ? 'AI가 분석 중...' : '나만의 플레이리스트 생성'}</button></div>
              </div>
            )}

            {isLoading && (<div className="flex flex-col items-center justify-center h-96 text-center"><Loader className="w-12 h-12 text-purple-400 animate-spin mb-4" /><p className="text-xl font-semibold text-white">AI가 당신의 여행을 분석하고 있어요...</p><p className="text-slate-400 mt-2">최고의 곡들을 선별하고 있습니다.</p></div>)}

            {playlist && !isLoading && (
              <div className="animate-fade-in space-y-8">
                <div className="flex flex-col md:flex-row gap-8 items-center">
                  <div className="w-full md:w-1/3 aspect-square bg-slate-900/50 rounded-lg flex items-center justify-center border border-slate-700 flex-shrink-0 shadow-2xl shadow-purple-900/30">
                    {isGeneratingImage && (<div className="text-center"><ImageIcon className="w-10 h-10 text-purple-400 animate-pulse mx-auto" /><p className="mt-2 text-sm text-slate-400">커버 생성 중...</p></div>)}
                    {coverImageUrl && <img src={coverImageUrl} alt="Playlist Cover" className="w-full h-full object-cover rounded-lg" />}
                  </div>
                  <div className="text-center md:text-left flex-grow">
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 text-transparent bg-clip-text mb-3">{playlist.playlistTitle}</h2>
                    <p className="text-slate-300 mb-6">{playlist.playlistDescription}</p>
                    <div className="flex items-center justify-center md:justify-start gap-3">
                      <button onClick={handleShare} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-purple-500/20"><Share2 className="w-4 h-4" /> 공유하기</button>
                      <button onClick={handleAddToYouTubeMusic} className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-red-500/30"><PlusCircle className="w-4 h-4" /> YouTube Music에 추가</button>
                    </div>
                    {copySuccess && <p className="text-green-400 text-sm mt-3 flex items-center justify-center md:justify-start gap-2 animate-fade-in-fast"><Copy className="w-4 h-4" /> {copySuccess}</p>}
                  </div>
                </div>
                <div className="space-y-3">
                  {playlist.songs.map((song, index) => (
                    <div key={index} className="bg-slate-800/60 p-4 rounded-lg border border-slate-700 transition-all duration-300 hover:bg-slate-700/80 hover:border-purple-500/50 flex items-center gap-4">
                      <div className="text-xl font-bold text-purple-400">{String(index + 1).padStart(2, '0')}</div>
                      <div className="flex-grow">
                        <p className="text-lg font-bold text-white">{song.title}</p>
                        <p className="text-sm text-slate-400">{song.artist}</p>
                        <p className="text-slate-300 text-sm italic mt-1">"{song.reason}"</p>
                      </div>
                      <a href={`https://music.youtube.com/search?q=${encodeURIComponent(song.artist + ' ' + song.title)}`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 ml-4 p-2 bg-red-600/20 hover:bg-red-500/40 rounded-full transition-colors" title="YouTube Music에서 듣기"><Youtube className="w-6 h-6 text-white" /></a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
