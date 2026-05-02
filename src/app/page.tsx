'use client';

import RegistrationWizard from '@/components/RegistrationWizard';
import Image from 'next/image';
import { motion } from 'framer-motion';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#2b0308] overflow-hidden relative">
      
      {/* Background Floating Orbs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <motion.div 
          animate={{ 
            y: [0, -20, 0], 
            scale: [1, 1.05, 1],
            opacity: [0.3, 0.5, 0.3] 
          }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#f81838] blur-[120px] opacity-30"
        />
        <motion.div 
          animate={{ 
            y: [0, 30, 0], 
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.4, 0.2] 
          }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-[40%] right-[-10%] w-[400px] h-[400px] rounded-full bg-poster-accent blur-[100px] opacity-20"
        />
        <motion.div 
          animate={{ 
            x: [0, 40, 0], 
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.3, 0.1] 
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-[#F4102B] blur-[150px] opacity-20"
        />
      </div>

      <section className="w-full relative z-10 bg-black">
        <div className="w-full max-w-2xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1, ease: "easeOut" }}
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
          {/* Blend Gradient Overlay - This is the magic trick for seamless blending */}
          <div className="absolute bottom-0 left-0 w-full h-[250px] bg-gradient-to-t from-[#2b0308] via-[#2b0308]/80 to-transparent z-10 pointer-events-none" />
          
          {/* Catchy Light Overlay Effect on Poster */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 2 }}
            className="absolute inset-0 bg-gradient-to-tr from-poster-accent/20 to-transparent mix-blend-overlay pointer-events-none z-10"
          />
        </div>
      </section>
      
      <section className="pb-32 pt-12 px-6 md:px-12 max-w-3xl mx-auto text-white relative z-20 -mt-16 md:-mt-24">
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          id="registration" 
          className="bg-[#3a040b]/80 border border-white/10 rounded-[2.5rem] p-8 md:p-12 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] scroll-mt-12 relative overflow-hidden"
        >
          {/* Glass edge highlight */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          
          <h3 className="text-3xl md:text-4xl font-black mb-10 text-white tracking-tight text-center drop-shadow-md">
            Secure Your Place
          </h3>
          <RegistrationWizard />
        </motion.div>
      </section>
    </main>
  );
}
