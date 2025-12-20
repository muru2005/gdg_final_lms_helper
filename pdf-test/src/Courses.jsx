import {useEffect,useState} from "react";
const Courses=()=>{
   const[currentCourses,setCurrentCourses]=useState([]);
   const[previousCourses,setPreviousCourses]=useState([]);
   const[searchTerm,setSearchTerm]=useState('');
   const[openSection,setOpenSection]=useState('current');
   useEffect(()=>{
        chrome.storage.local.get(['currentSemesterCourses','allCourses'],(result)=>{
            if(result.currentSemesterCourses){
                setCurrentCourses(result.currentSemesterCourses);
            }
            if(result.allCourses && result.currentSemesterCourses){
              const currentIds=new Set(result.currentSemesterCourses.map(c=>c.id));
              const previous=result.allCourses.filter(c=>!currentIds.has(c.id));
              setPreviousCourses(previous);             

            }
        });


   },[]);
   const filterCourses=(list)=>{
    return list.filter(course=>{
       return course.title.toLowerCase().includes(searchTerm.toLowerCase())||
       course.id.toString().includes(searchTerm)
    })
   };
    const toggleSection = (section) => {
    setOpenSection(openSection === section ? null : section);
  };
  const CourseCard = ({ course, type }) => (
    <a 
      href={course.link} 
      target="_blank" 
      rel="noreferrer"
      className="block p-4 mb-3 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all active:scale-[0.98] group"
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-700 leading-tight group-hover:text-indigo-600 transition-colors">
    
            {course.title.replace(/Remove from view/gi, '').trim()}
          </p>
          <p className="text-[10px] text-slate-400 mt-1 font-medium tracking-wide">COURSE ID: {course.id}</p>
        </div>
        <div className="ml-2 flex flex-col items-end">
          <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter ${type === 'current' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
            {type === 'current' ? 'Active' : 'Past'}
          </span>
          <span className="text-indigo-400 text-lg mt-1 opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
        </div>
      </div>
    </a>
  );

  return (
    <div className="p-4 bg-slate-50 min-h-screen font-sans">
      
   
      <div className="sticky top-0 z-10 pb-4 bg-slate-50">
        <div className="relative group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">🔍</span>
          <input 
            type="text"
            placeholder="Search 80+ courses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 text-slate-900 placeholder:text-slate-800 bg-white rounded-2xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
            >✕</button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto custom-scrollbar">

        <div className="mb-4">
          <button 
            onClick={() => toggleSection('current')}
            className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm active:bg-slate-50 transition-colors"
          >
            <div className="flex items-center">
              <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold text-xs mr-3 shadow-indigo-200 shadow-lg">
                {filterCourses(currentCourses).length}
              </div>
              <span className="font-bold text-slate-700 text-sm">Current Semester</span>
            </div>
            <span className={`text-slate-400 transition-transform duration-300 ${openSection === 'current' ? 'rotate-180' : ''}`}>▼</span>
          </button>
          
          <div className={`overflow-hidden transition-all duration-500 ease-in-out ${openSection === 'current' ? 'max-h-[5000px] mt-4 opacity-100' : 'max-h-0 opacity-0'}`}>
            {filterCourses(currentCourses).map((c, i) => <CourseCard key={i} course={c} type="current" />)}
          </div>
        </div>

     
        <div>
          <button 
            onClick={() => toggleSection('previous')}
            className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm active:bg-slate-50 transition-colors"
          >
            <div className="flex items-center">
              <div className="w-8 h-8 bg-slate-300 text-white rounded-xl flex items-center justify-center font-bold text-xs mr-3">
                {filterCourses(previousCourses).length}
              </div>
              <span className="font-bold text-slate-500 text-sm">Previous Semesters</span>
            </div>
            <span className={`text-slate-400 transition-transform duration-300 ${openSection === 'previous' ? 'rotate-180' : ''}`}>▼</span>
          </button>
          
          <div className={`overflow-hidden transition-all duration-500 ease-in-out ${openSection === 'previous' ? 'max-h-[5000px] mt-4 opacity-100' : 'max-h-0 opacity-0'}`}>
            {filterCourses(previousCourses).map((c, i) => <CourseCard key={i} course={c} type="previous" />)}
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );

  

}
export default Courses;