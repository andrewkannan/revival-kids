'use client';

import RegistrationWizard from '@/components/RegistrationWizard';
import Image from 'next/image';
import { motion } from 'framer-motion';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#2b0308] overflow-hidden relative font-sans">
      
      {/* Background Floating Orbs (Visible behind the form and blending section) */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <motion.div 
          animate={{ y: [0, -30, 0], scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#f81838] blur-[120px]"
        />
        <motion.div 
          animate={{ y: [0, 40, 0], scale: [1, 1.2, 1], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-[60%] right-[-15%] w-[600px] h-[600px] rounded-full bg-[#F4102B] blur-[150px]"
        />
      </div>

      {/* Solid Red Background for the Poster Container */}
      <section className="w-full relative z-10 bg-[#F4102B]">
        <div className="w-full max-w-2xl mx-auto relative overflow-hidden shadow-2xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <Image 
              src="/revival-kids-poster.jpg" 
              alt="Revival Kids Poster" 
              width={1200}
              height={1600}
              className="w-full h-auto relative z-0"
              priority
            />
          </motion.div>
          
          {/* High-Level "Catchy" Light Sweep Animation over Poster */}
          <motion.div 
             animate={{ left: ['-100%', '200%'] }}
             transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
             className="absolute top-0 bottom-0 w-[50%] bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-20deg] pointer-events-none z-20"
          />
        </div>
      </section>

      {/* Seamless Gradient Blending Panel (No overlapping the poster!) */}
      <div className="w-full h-48 bg-gradient-to-b from-[#F4102B] to-[#2b0308] relative z-0" />
      
      <section className="pb-32 px-6 md:px-12 max-w-3xl mx-auto text-white relative z-20 -mt-32">
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          id="registration" 
          className="bg-white/15 border-2 border-white/30 rounded-[2.5rem] p-8 md:p-12 backdrop-blur-3xl shadow-[0_0_80px_rgba(244,16,43,0.5)] scroll-mt-12 relative overflow-hidden"
        >
          {/* Glass edge highlight for premium feel */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          
          <h3 className="text-3xl md:text-4xl font-black mb-10 text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-[#ff99a8] tracking-tight text-center drop-shadow-2xl filter drop-shadow-[0_2px_10px_rgba(255,255,255,0.3)]">
            Secure Your Place
          </h3>
          <RegistrationWizard />
        </motion.div>
      </section>
    </main>
  );
}
