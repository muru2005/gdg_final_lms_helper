import { useEffect, useState } from "react";
import { Search, X, ChevronDown, ArrowUpRight } from 'lucide-react';

const Courses = () => {
  const [currentCourses, setCurrentCourses] = useState([]);
  const [previousCourses, setPreviousCourses] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [openSection, setOpenSection] = useState('current');

  useEffect(() => {
    chrome.storage.local.get(['currentSemesterCourses', 'allCourses'], (result) => {
      if (result.currentSemesterCourses) {
        setCurrentCourses(result.currentSemesterCourses);
      }
      if (result.allCourses && result.currentSemesterCourses) {
        const currentIds = new Set(result.currentSemesterCourses.map(c => c.id));
        const previous = result.allCourses.filter(c => !currentIds.has(c.id));
        setPreviousCourses(previous);
      }
    });
  }, []);

  const filterCourses = (list) => {
    return list.filter(course => {
      return course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
      className="block p-4 mb-2.5 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-violet-200 transition-all duration-200 active:scale-[0.99] group"
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 pr-3">
          <p className="text-sm font-semibold text-slate-700 leading-snug group-hover:text-violet-600 transition-colors">
            {course.title.replace(/Remove from view/gi, '').trim()}
          </p>
          <p className="text-[10px] text-slate-400 mt-1.5 font-mono tracking-wide">ID: {course.id}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tight ${type === 'current'
              ? 'bg-violet-100 text-violet-600'
              : 'bg-slate-100 text-slate-500'
            }`}>
            {type === 'current' ? 'Active' : 'Past'}
          </span>
          <ArrowUpRight size={14} className="text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </a>
  );

  return (
    <div className="min-h-screen font-sans">
      {/* Search Bar */}
      <div className="sticky top-0 z-10 pb-4 bg-slate-50">
        <div className="relative group">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-violet-500 transition-colors"
          />
          <input
            type="text"
            placeholder="Search courses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-10 py-3 text-slate-900 placeholder:text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all text-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Courses Sections */}
      <div className="space-y-3">
        {/* Current Semester */}
        <div>
          <button
            onClick={() => toggleSection('current')}
            className="w-full flex items-center justify-between p-4 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-lg flex items-center justify-center font-bold text-xs mr-3 shadow-md shadow-violet-200">
                {filterCourses(currentCourses).length}
              </div>
              <span className="font-semibold text-slate-700 text-sm">Current Semester</span>
            </div>
            <ChevronDown
              size={18}
              className={`text-slate-400 transition-transform duration-300 ${openSection === 'current' ? 'rotate-180' : ''}`}
            />
          </button>

          <div className={`overflow-hidden transition-all duration-400 ease-out ${openSection === 'current' ? 'max-h-[5000px] mt-3 opacity-100' : 'max-h-0 opacity-0'}`}>
            {filterCourses(currentCourses).map((c, i) => <CourseCard key={i} course={c} type="current" />)}
          </div>
        </div>

        {/* Previous Semesters */}
        <div>
          <button
            onClick={() => toggleSection('previous')}
            className="w-full flex items-center justify-between p-4 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center">
              <div className="w-8 h-8 bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center font-bold text-xs mr-3">
                {filterCourses(previousCourses).length}
              </div>
              <span className="font-semibold text-slate-500 text-sm">Previous Semesters</span>
            </div>
            <ChevronDown
              size={18}
              className={`text-slate-400 transition-transform duration-300 ${openSection === 'previous' ? 'rotate-180' : ''}`}
            />
          </button>

          <div className={`overflow-hidden transition-all duration-400 ease-out ${openSection === 'previous' ? 'max-h-[5000px] mt-3 opacity-100' : 'max-h-0 opacity-0'}`}>
            {filterCourses(previousCourses).map((c, i) => <CourseCard key={i} course={c} type="previous" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Courses;