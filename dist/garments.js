// Original vector pattern studies used for the sample wardrobe.
const patterns = {
  shirt: ['M70 47 94 38 108 52 122 38 146 47 177 105 152 121 137 96 139 198 Q108 204 77 198 L79 96 64 121 39 105Z','M94 38 88 63 101 73 108 52 116 73 129 62 122 38 M108 54V199 M79 96 70 47 M137 96 146 47 M119 82h17v20q-9 8-17-1Z M44 99l24 15 M148 114l24-15'],
  trousers: ['M71 40 Q107 47 145 40 L150 98 153 200 114 200 106 113 96 200 55 200 63 100Z','M70 50q37 9 76 0 M106 53v40q9-2 10-20V53 M72 56q1 18-8 25 M140 55q-1 15 7 24 M86 63l-13 131 M126 63l8 131 M56 191h41 M114 191h38'],
  shoe: ['M34 92 Q46 95 61 79 L82 107 Q91 109 101 93 L126 120 161 132 Q176 135 181 145 L180 157 Q143 167 103 153 L47 142 Q30 138 29 125Z','M30 125q8 10 29 13l49 12q35 11 73-5 M56 94q14 35 43 35l21-15 M104 103l-16 13 M113 111l-16 12 M121 118l-15 11 M35 103q12 2 22 17'],
  jacket: ['M68 50 91 39 107 46 125 38 148 49 175 151 153 157 137 111 141 177 Q108 185 73 178 L77 111 61 159 38 151Z','M91 39l-5 29 17 9 4-31 8 31 16-10-6-29 M108 47v132 M77 112l-9-62 M137 112l11-62 M80 85h20v17l-10 6-10-6Z M116 85h20v17l-10 6-10-6Z M75 167q33 6 65 0 M42 140l22 7 M150 146l22-7'],
  dress: ['M84 38 95 37q11 23 25 0l12 1 4 46-13 20q13 40 42 84-54 19-111 0 30-48 41-84L81 83Z','M96 103q13 5 28 0 M97 111l-22 72 M116 111l21 72 M107 115v69 M57 182q52 16 105 0'],
};
export function garment(type, color, id='piece'){
 const [shape,seams]=patterns[type]||patterns.shirt;
 return '<svg viewBox="0 0 215 235" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="weave-'+id+'" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0h4M0 0v4" stroke="#473e34" opacity=".12" stroke-width=".65"/></pattern></defs><path d="'+shape+'" fill="'+color+'" stroke="#36382e" stroke-width="2" stroke-linejoin="round"/><path d="'+shape+'" fill="url(#weave-'+id+')"/><path d="'+seams+'" fill="none" stroke="#39382e" opacity=".67" stroke-width="1.5" stroke-linejoin="round"/></svg>';
}
