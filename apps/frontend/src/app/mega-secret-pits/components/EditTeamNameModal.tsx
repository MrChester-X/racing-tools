import { useEffect, useState } from "react";
import Modal from "./Modal";
import { ParsedRaceTeam } from "@/app/mega-secret-pits/types";

interface EditTeamNameModalProps {
  isOpen: boolean;
  team: ParsedRaceTeam | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export default function EditTeamNameModal({
  isOpen,
  team,
  onClose,
  onSubmit,
}: EditTeamNameModalProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (isOpen && team) setName(team.name);
  }, [isOpen, team]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-8">Переименовать команду</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="editTeamName" className="block text-lg font-medium text-gray-300 mb-3 text-left">
              Название команды
            </label>
            <input
              type="text"
              id="editTeamName"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 transition-all duration-200"
              placeholder="Введите название команды"
            />
          </div>
          <div className="flex gap-4 justify-center pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-8 py-3 text-gray-300 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors duration-200 min-w-[120px]"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 min-w-[120px]"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
