import React, { useEffect, useState } from 'react';
const Dashboard=()=>{
    const[Stats,setStats]=useState({currentCount:0,totalCount:0,overdueCount:0,semester:6});
    const[overdueAssignments,setOverdueAssignments]=useState([]);
    useEffect(()=>{
        chrome.storage.local.get(['lmsStats','currentSemesterCourses','OverdueAssignments'],(result)=>{
            if(result.lmsStats){
                setStats(result.lmsStats);
            }
            if(result.overdueAssignments){
               setOverdueAssignments(result.overdueAssignments);
            }
        });

    },[]);
    return (
      <div className='p-4 bg-slate-50 min-h-screen font-sans text-slate-900'>
        <div className='grid grid-cols-2 gap-4 mb-6'>
          <div className='bg-indigo-600 p-5 rounded-2xl flex flex-col items-center justify-center'>
             <h1 className='text-2xl font-bold text-shadow-white'>{Stats.currentCount}</h1>
             <p className='text-shadow-white'>Current Courses</p>
          </div>
          <div className='bg-indigo-600 p-5 rounded-2xl flex flex-col items-center justify-center'>
             <h1 className='text-2xl font-bold text-shadow-white'>{Stats.totalCount}</h1>
             <p className='text-shadow-white'>Total Courses</p>
          </div>
          <div className='bg-indigo-600 p-5 rounded-2xl flex flex-col items-center justify-center'>
             <h1 className='text-2xl font-bold text-shadow-white'>{Stats.overdueCount}</h1>
             <p className='text-shadow-white'>Overdue Tasks</p>
          </div>
          <div className='bg-indigo-600 p-5 rounded-2xl flex flex-col items-center justify-center'>
             <h1 className='text-2xl font-bold text-shadow-white'>{Stats.semester}</h1>
             <p className='text-shadow-white'>Semester</p>
          </div>
          
        </div>
          <div className='p-5'>
                {overdueAssignments.length>0?(
                    <div className='space-y-3'>
                       {
                        overdueAssignments.map((task,index)=>{
                             <a 
                  key={index} 
                  href={task.link} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center p-3 rounded-xl border border-slate-100 hover:border-red-200 hover:bg-red-50 transition-all group"
                >
                    <div className='flex -1'> 
                        <p className='text-xs font-bold text-shadow-white'>{task.title}</p>
                        <p className='text-slate-400 text-[20px]'>Click to go to assignment</p>
                    </div>
                </a>
                     })
                    }
                  </div>   
                ):(
                   <div className='flex flex-col items-center justify-center py-8 text-center'>
                     <p className=' text-2xl font-bold text-gray-300'>No Overdue Assignments !</p>
                    </div>

                )};

          </div>


      </div>

    ); 


}
export default Dashboard;